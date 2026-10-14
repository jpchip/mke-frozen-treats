import type { Browser } from "npm:puppeteer";
import Tesseract from "npm:tesseract.js@5";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Gilles publishes its Flavor of the Day calendar as a stack of Wix-hosted
// PNGs rather than an HTML calendar or a single monthly image: one header
// image (month name, weekday labels, and the first few days) followed by one
// image per calendar week, e.g. "October-04-10.png". Stacked together they
// form the same 7-column (Sun-Sat) grid as before, where each day's cell has
// a date number in the top-right corner, a photo, the bold flavor name, and
// (for open days) a "Contains: ..." ingredients line.
//
// Since the calendar is no longer a single image we can't just download one
// URL. Instead we screenshot the element containing the stacked row images
// and OCR that screenshot with tesseract.js (pure WASM, no system binary),
// using the recognized words' bounding boxes to locate today's cell: the
// column comes from today's weekday, and the row is found by matching the
// date-number token (right-aligned near the top of each cell) equal to
// today's day-of-month. Everything between that date number and the next
// date number in the same column (or the "Contains:" label) is the flavor
// name.
const CALENDAR_TIMEZONE = 'America/Chicago';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_WORD_CONFIDENCE = 50;

interface OcrWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
}

function getPngDimensions(bytes: Uint8Array): { width: number; height: number } {
    // PNG signature (8 bytes) is followed by the IHDR chunk: length (4 bytes),
    // "IHDR" (4 bytes), width (4 bytes, big-endian), height (4 bytes, big-endian).
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        width: view.getUint32(16, false),
        height: view.getUint32(20, false),
    };
}

function getTodayInCalendar(): { day: number; weekdayIndex: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CALENDAR_TIMEZONE,
        weekday: 'short',
        day: 'numeric',
    }).formatToParts(new Date());

    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? '';

    return { day, weekdayIndex: WEEKDAYS.indexOf(weekdayShort) };
}

function extractFlavorFromWords(
    words: OcrWord[],
    imageWidth: number,
    day: number,
    weekdayIndex: number,
): string | null {
    const colWidth = imageWidth / WEEKDAYS.length;
    const colX0 = weekdayIndex * colWidth;
    const colX1 = colX0 + colWidth;
    const margin = colWidth * 0.25;

    const inColumn = (w: OcrWord) => w.bbox.x0 >= colX0 - margin && w.bbox.x1 <= colX1 + margin;

    // Date-number badges sit right-aligned near the top of each cell. Collect
    // every one in this weekday's column, top to bottom, so we can bound
    // today's row between its own date number and the next one.
    const dateTokens = words
        .filter((w) =>
            /^\d{1,2}$/.test(w.text) &&
            w.confidence > MIN_WORD_CONFIDENCE &&
            inColumn(w) &&
            w.bbox.x1 >= colX1 - margin
        )
        .sort((a, b) => a.bbox.y0 - b.bbox.y0);

    const dateIndex = dateTokens.findIndex((w) => Number(w.text) === day);
    if (dateIndex === -1) {
        return null;
    }

    const dateY = dateTokens[dateIndex].bbox.y0;
    const nextDateY = dateTokens[dateIndex + 1]?.bbox.y0 ?? Infinity;

    // Every cell has a fixed-height photo directly under the date badge; OCR
    // picks up low-value noise from it (e.g. stray "3:", "pa", "J" tokens).
    // Real text (flavor name, "CLOSED", "Contains:") consistently starts
    // well below that photo, so skip a photo-height band under the date
    // number rather than relying on OCR confidence alone (real words can
    // also have low confidence, e.g. small ingredient text).
    const photoZonePx = imageWidth * 0.115;
    const cellWords = words
        .filter((w) =>
            inColumn(w) &&
            w.bbox.y0 >= dateY + photoZonePx &&
            w.bbox.y0 < nextDateY &&
            w.confidence > MIN_WORD_CONFIDENCE
        )
        .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

    if (cellWords.some((w) => /^closed$/i.test(w.text))) {
        return 'Closed';
    }

    const containsIndex = cellWords.findIndex((w) => /^contains:?$/i.test(w.text));
    const flavorWords = containsIndex === -1 ? cellWords : cellWords.slice(0, containsIndex);

    const flavor = flavorWords.map((w) => w.text).join(' ').trim();
    return flavor.length > 0 ? flavor : null;
}

// Each weekly calendar row is published as its own image with an alt text
// like "October-04-10.png" (month name, dash, two-digit start day, dash,
// two-digit end day). This matches those row images without hardcoding a
// specific month or Wix component id.
const WEEK_ROW_ALT_PATTERN = /^[A-Za-z]+-\d{2}-\d{2}\.png$/i;

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Gilles...');
    const page = await browser.newPage();
    page.emulateTimezone(CALENDAR_TIMEZONE);
    // Wix reflows the calendar to a cramped single column on narrow
    // viewports, which breaks the 7-column OCR math below, so force a
    // desktop-width viewport. A 2x device scale factor keeps the screenshot
    // sharp enough for OCR despite the extra scroll height.
    await page.setViewport({ width: 1280, height: 1200, deviceScaleFactor: 2 });

    await page.goto(site.url);

    await page.waitForFunction(
        (pattern: string) => [...document.querySelectorAll('img')].some((img) => new RegExp(pattern, 'i').test(img.alt)),
        { timeout: 5000 },
        WEEK_ROW_ALT_PATTERN.source,
    );

    const weekRowImages = [];
    for (const imageHandle of await page.$$('img')) {
        const alt = await imageHandle.evaluate((img) => img.alt);
        if (WEEK_ROW_ALT_PATTERN.test(alt)) {
            weekRowImages.push(imageHandle);
        } else {
            await imageHandle.dispose();
        }
    }

    if (weekRowImages.length === 0) {
        await page.close();
        return 'See website';
    }

    // The row images are lazy-loaded, so scroll each one into view and wait
    // for it to actually finish loading before screenshotting; otherwise the
    // last (lowest) rows can still be blank placeholders.
    for (const image of weekRowImages) {
        await image.evaluate((img) => img.scrollIntoView());
        await page.waitForFunction((img: HTMLImageElement) => img.naturalWidth > 0, {}, image);
    }

    // Find the lowest common ancestor of the week-row images: that element
    // also contains the header row (month name, weekday labels, first few
    // days) above them, and excludes unrelated images elsewhere on the page
    // (like the separate flavor-of-the-month graphic).
    const calendarHandle = await page.evaluateHandle((...images: Element[]) => {
        let ancestor: Element | null = images[0].parentElement;
        while (ancestor && !images.every((img) => ancestor!.contains(img))) {
            ancestor = ancestor.parentElement;
        }
        return ancestor;
    }, ...weekRowImages);
    const calendarElement = calendarHandle.asElement();

    if (!calendarElement) {
        await page.close();
        return 'See website';
    }

    const { day, weekdayIndex } = getTodayInCalendar();
    if (weekdayIndex === -1) {
        await page.close();
        return 'See website';
    }

    const bytes = await calendarElement.screenshot({ type: 'png', captureBeyondViewport: true });
    await page.close();

    const { width } = getPngDimensions(bytes);

    const result = await Tesseract.recognize(bytes, 'eng');
    const words = (result.data.words ?? []) as OcrWord[];

    const flavor = extractFlavorFromWords(words, width, day, weekdayIndex);
    return flavor ?? 'See website';
}

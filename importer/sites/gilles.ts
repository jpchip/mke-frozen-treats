import type { Browser } from "npm:puppeteer";
import Tesseract from "npm:tesseract.js@5";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Gilles publishes its Flavor of the Day calendar as a single monthly image
// (a Wix-hosted PNG whose filename looks like "26-09-FOD-Caledar.png") rather
// than an HTML calendar. The image is a 7-column (Sun-Sat) grid where each
// day's cell has a date number in the top-right corner, a photo, the bold
// flavor name, and (for open days) a "Contains: ..." ingredients line.
//
// To read today's flavor we OCR the image with tesseract.js (pure WASM, no
// system binary) and use the recognized words' bounding boxes to locate
// today's cell: the column comes from today's weekday, and the row is found
// by matching the date-number token (right-aligned near the top of each
// cell) equal to today's day-of-month. Everything between that date number
// and the next date number in the same column (or the "Contains:" label)
// is the flavor name.
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

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Gilles...');
    const page = await browser.newPage();
    page.emulateTimezone(CALENDAR_TIMEZONE);

    await page.goto(site.url);

    const calendarImage = await page.waitForSelector('img[src*="FOD-Caledar"]', { timeout: 5000 });
    const calendarImageUrl = await calendarImage.evaluate((img) => img.getAttribute('src'));
    await page.close();

    if (!calendarImageUrl) {
        return '?';
    }

    const { day, weekdayIndex } = getTodayInCalendar();
    if (weekdayIndex === -1) {
        return '?';
    }

    const response = await fetch(calendarImageUrl);
    if (!response.ok) {
        throw new Error(`Failed to download Gilles calendar image: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { width } = getPngDimensions(bytes);

    const result = await Tesseract.recognize(bytes, 'eng');
    const words = (result.data.words ?? []) as OcrWord[];

    const flavor = extractFlavorFromWords(words, width, day, weekdayIndex);
    return flavor ?? '?';
}

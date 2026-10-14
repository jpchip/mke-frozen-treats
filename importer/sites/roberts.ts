import type { Browser } from "npm:puppeteer";
import Tesseract from "npm:tesseract.js@5";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

// Robert's publishes its monthly flavor list as a scanned sheet (a PDF that
// wraps one JPEG per page) rather than HTML. The list page has a
// "<MONTH> FLAVOR LIST" header, then one entry per row: a left column with
// "<day> <Weekday>" (or a "BOOSTER!!" / "NEW FLAVOR ALERT!!!" box) and a right
// column with the flavor name in bold capitals, optionally followed by
// "- description" text that can wrap onto lowercase continuation lines.
//
// We OCR the sheet with tesseract.js, locate the flavor column from the
// weekday words, re-OCR just that column (so the left-hand boxes can't bleed
// into the flavor lines), pick out the lines that start with an ALL-CAPS run,
// and number the entries using the day numbers that are legible in the left
// column, counting forward from the previous entry where they aren't.
const CALENDAR_TIMEZONE = 'America/Chicago';
const UNKNOWN = 'See website';

interface OcrWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrLine {
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface FlavorEntry {
    flavor: string;
    yCenter: number;
    height: number;
}

const WEEKDAY_WORD = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*day$/i;

function getImageSize(bytes: Uint8Array): { width: number; height: number } | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // PNG: IHDR holds big-endian width/height at offsets 16 and 20.
    if (bytes.length > 24 && view.getUint32(0, false) === 0x89504e47) {
        return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    }

    // JPEG: walk the marker segments until a start-of-frame marker.
    if (bytes.length > 4 && view.getUint16(0, false) === 0xffd8) {
        let offset = 2;
        while (offset + 9 < bytes.length) {
            if (bytes[offset] !== 0xff) {
                offset++;
                continue;
            }
            const marker = bytes[offset + 1];
            const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
            if (isSof) {
                return { height: view.getUint16(offset + 5, false), width: view.getUint16(offset + 7, false) };
            }
            offset += 2 + view.getUint16(offset + 2, false);
        }
    }

    return null;
}

// Pulls the JPEG streams (DCTDecode) out of a PDF without a PDF library. The
// flavor sheets are scans, so each page is a single embedded JPEG.
export function extractJpegsFromPdf(pdf: Uint8Array): Uint8Array[] {
    const text = new TextDecoder('latin1').decode(pdf);
    const jpegs: Uint8Array[] = [];

    for (const match of text.matchAll(/\/DCTDecode/g)) {
        const streamKeyword = text.indexOf('stream', match.index);
        if (streamKeyword === -1) continue;

        let start = streamKeyword + 'stream'.length;
        if (text[start] === '\r') start++;
        if (text[start] === '\n') start++;

        const end = text.indexOf('endstream', start);
        if (end === -1) continue;

        // Trim any trailing EOL so the slice ends on the JPEG EOI marker.
        let stop = end;
        while (stop > start && (pdf[stop - 1] === 0x0a || pdf[stop - 1] === 0x0d)) stop--;

        if (pdf[start] === 0xff && pdf[start + 1] === 0xd8) {
            jpegs.push(pdf.slice(start, stop));
        }
    }

    return jpegs;
}

function toTitleCase(value: string): string {
    return value
        .toLowerCase()
        .replace(/(^|[\s-])([a-z])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase())
        .replace(/'([A-Z])/g, (_, letter: string) => "'" + letter.toLowerCase());
}

// Returns the month named in the "<MONTH> FLAVOR LIST" header and the y
// coordinate where the list starts, or null if this isn't the list page.
export function findHeader(words: OcrWord[]): { month: string | null; listTop: number } | null {
    for (let i = 0; i < words.length - 1; i++) {
        if (/^flavor$/i.test(words[i].text) && /^list/i.test(words[i + 1].text)) {
            const month = i > 0 && /^[a-z]{3,9}$/i.test(words[i - 1].text) ? words[i - 1].text : null;
            return { month, listTop: Math.max(words[i].bbox.y1, words[i + 1].bbox.y1) };
        }
    }
    return null;
}

// Estimates where the flavor column starts and where the list ends, from the
// weekday words in the left column and the first word right after each.
export function findColumns(
    words: OcrWord[],
    imageWidth: number,
    listTop: number,
): { flavorX: number; listBottom: number | null } | null {
    const starts: number[] = [];

    for (const weekday of words) {
        if (!WEEKDAY_WORD.test(weekday.text) || weekday.bbox.y0 < listTop || weekday.bbox.x0 > imageWidth * 0.4) {
            continue;
        }
        const yCenter = (weekday.bbox.y0 + weekday.bbox.y1) / 2;
        const next = words
            .filter((w) =>
                w.bbox.x0 >= weekday.bbox.x1 &&
                (w.bbox.y0 + w.bbox.y1) / 2 > yCenter - (weekday.bbox.y1 - weekday.bbox.y0) / 2 &&
                (w.bbox.y0 + w.bbox.y1) / 2 < yCenter + (weekday.bbox.y1 - weekday.bbox.y0) / 2
            )
            .sort((a, b) => a.bbox.x0 - b.bbox.x0)[0];
        if (next) starts.push(next.bbox.x0);
    }

    if (starts.length === 0) return null;

    starts.sort((a, b) => a - b);
    const flavorX = starts[Math.floor(starts.length / 2)];
    const phone = words.find((w) => /^phone$/i.test(w.text) && w.bbox.y0 > listTop);

    return { flavorX, listBottom: phone ? phone.bbox.y0 : null };
}

// Lines that start with an ALL-CAPS run (optionally followed by a dash and a
// description) are flavor names; lowercase continuation lines are ignored.
export function parseFlavorLine(rawText: string): string | null {
    const tokens = rawText.replace(/^[^A-Za-z]+/, '').split(/\s+/).filter(Boolean);

    const run: string[] = [];
    while (tokens.length > 0 && /^[A-Z][A-Z'’&.]*[,!]?$/.test(tokens[0]) && !/^[,!]/.test(tokens[0])) {
        run.push(tokens.shift()!.replace(/[,!]$/, ''));
    }
    // A lone trailing letter ("MINT FUDGE BROWNIE J") is edge noise.
    while (run.length > 1 && run[run.length - 1].replace(/[^A-Za-z]/g, '').length === 1) run.pop();
    if (run.length === 0) return null;

    // The sheet's right edge produces stray 1-2 character OCR junk ("; f",
    // "bi") after names, so ignore those before deciding whether the run is
    // the whole line or is followed by a "- description".
    const rest = tokens.join(' ');
    const meaningful = tokens.filter((t) => t.length > 2).join(' ');
    const endsCleanly = rest === '' || /^[-–—]/.test(rest) || meaningful === '';
    if (!endsCleanly) return null;

    const flavor = run.join(' ').replace(/[^A-Za-z]+$/, '');
    if (flavor.length < 3 || /^(NEW FLAVOR|ALERT|BOOSTER)/.test(flavor)) return null;

    return toTitleCase(flavor);
}

export function parseEntries(lines: OcrLine[]): FlavorEntry[] {
    const entries: FlavorEntry[] = [];

    for (const line of [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
        const flavor = parseFlavorLine(line.text);
        if (flavor) {
            entries.push({
                flavor,
                yCenter: (line.bbox.y0 + line.bbox.y1) / 2,
                height: line.bbox.y1 - line.bbox.y0,
            });
        }
    }

    return entries;
}

// Maps each entry to a day of the month. The left column's day number is used
// when OCR read one next to the entry; otherwise the entry follows the
// previous one (booster / new-flavor boxes replace the number on those days).
export function assignDays(entries: FlavorEntry[], words: OcrWord[], flavorX: number): Map<number, string> {
    const days = new Map<number, string>();
    let previousDay = 0;

    for (const entry of entries) {
        const anchor = words
            .filter((w) =>
                w.bbox.x1 <= flavorX &&
                Math.abs((w.bbox.y0 + w.bbox.y1) / 2 - entry.yCenter) < Math.max(entry.height, 10) * 0.75
            )
            .map((w) => /^\D?(\d{1,2})\D?$/.exec(w.text)?.[1])
            .filter((n): n is string => n !== undefined)
            .map(Number)
            .find((n) => n >= 1 && n <= 31 && n > previousDay);

        const day = anchor ?? previousDay + 1;
        if (day > 31) break;

        if (!days.has(day)) days.set(day, entry.flavor);
        previousDay = day;
    }

    return days;
}

function getToday(): { day: number; month: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CALENDAR_TIMEZONE,
        day: 'numeric',
        month: 'long',
    }).formatToParts(new Date());

    return {
        day: Number(parts.find((p) => p.type === 'day')?.value),
        month: parts.find((p) => p.type === 'month')?.value ?? '',
    };
}

async function findSheetUrl(browser: Browser, siteUrl: string): Promise<string | null> {
    const page = await browser.newPage();
    page.emulateTimezone(CALENDAR_TIMEZONE);

    try {
        await page.goto(siteUrl);

        const html = await page.content();
        const pdfUrl = /https?:\/\/[^"'\s<>\\]+\.pdf/i.exec(html)?.[0];
        if (pdfUrl) return pdfUrl;

        // No PDF: fall back to the largest content image (skipping QR codes).
        return await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'))
                .filter((img) => !img.src.includes('qrserver') && img.naturalWidth >= 300)
                .sort((a, b) => b.naturalHeight - a.naturalHeight);
            return images[0]?.src ?? null;
        });
    } finally {
        await page.close();
    }
}

async function downloadPageImages(url: string): Promise<Uint8Array[]> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download Roberts flavor sheet: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());

    const isPdf = new TextDecoder('latin1').decode(bytes.slice(0, 5)) === '%PDF-';
    return isPdf ? extractJpegsFromPdf(bytes) : [bytes];
}

export async function parseFlavorSheet(
    images: Uint8Array[],
    today: { day: number; month: string },
): Promise<Map<number, string> | null> {
    const worker = await Tesseract.createWorker('eng');

    try {
        for (const image of images) {
            const size = getImageSize(image);
            if (!size) continue;

            const first = await worker.recognize(image);
            const words = (first.data.words ?? []) as OcrWord[];

            const header = findHeader(words);
            if (!header) continue;

            if (header.month && header.month.toLowerCase() !== today.month.toLowerCase()) {
                console.log(`Roberts flavor sheet is for ${header.month}, not ${today.month}`);
                return null;
            }

            const columns = findColumns(words, size.width, header.listTop);
            if (!columns) return null;

            const left = Math.max(0, Math.floor(columns.flavorX - size.width * 0.005));
            const top = Math.floor(header.listTop);
            const bottom = columns.listBottom ?? size.height;

            const second = await worker.recognize(image, {
                rectangle: { left, top, width: size.width - left, height: Math.max(1, Math.floor(bottom - top)) },
            });
            const entries = parseEntries((second.data.lines ?? []) as OcrLine[]);

            return assignDays(entries, words, columns.flavorX);
        }
    } finally {
        await worker.terminate();
    }

    return null;
}

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Roberts...');

    const sheetUrl = await findSheetUrl(browser, site.url);
    if (!sheetUrl) {
        return UNKNOWN;
    }

    const images = await downloadPageImages(sheetUrl);
    const today = getToday();
    const days = await parseFlavorSheet(images, today);

    return days?.get(today.day) ?? UNKNOWN;
}

import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Golden Gyro...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    try {
        await page.goto(site.url);
        await page.waitForSelector('[data-ux="HeadingMiddle"]', { timeout: 2000 });

        // GoDaddy Website Builder truncates the generated data-aid attribute
        // (e.g. "MENU_CATEGORY_SEPTEMBER2" for both Sept 2nd and Sept 20th),
        // so days collide if you key off it. Match on the visible heading
        // text instead, which is unambiguous.
        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const month = today.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = today.getDate();

        const flavorOfTheDay = await page.evaluate((month: string, day: number) => {
            const heads = Array.from(document.querySelectorAll('[data-ux="HeadingMiddle"]'));
            const match = heads.find((el) => {
                // headings carry inconsistent whitespace: "September  20th", "August   3rd", "August  9th "
                const m = /^([A-Za-z]+)\s+(\d{1,2})/.exec((el.textContent ?? '').trim());
                return !!m && m[1].toLowerCase() === month && Number(m[2]) === day;
            });
            const category = match?.closest('[data-aid^="MENU_CATEGORY_"]');
            return category?.querySelector('[data-ux="HeadingMinor"]')?.textContent?.trim() ?? null;
        }, month, day);

        return flavorOfTheDay ?? 'See website';
    } finally {
        await page.close();
    }
}

import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Georgie Porgies...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    await page.goto(site.url);

    const todayCard = await page.waitForSelector('.flavor-feature-card.is-today', { timeout: 2000 });
    const flavorOfTheDayText = await todayCard.$eval('.flavor-feature-name', element => element.textContent?.trim() ?? '');
    await page.close();

    return flavorOfTheDayText;
}

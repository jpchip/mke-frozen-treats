import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Gilles...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    await page.goto(site.url);

    const flavorTd = await page.waitForSelector(`.single-day.today`, { timeout: 2000 });
    const flavorsOfTheDay = await flavorTd.$$eval('.field-content a', options => {
        return options.map(option => option.innerText);
    });
    await page.close();
    if (flavorsOfTheDay.length > 0) {
        return flavorsOfTheDay.filter((v) => v !== '').join(',');
    }
    return '?';
}
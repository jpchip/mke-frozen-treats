import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Kopps...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');
    await page.goto(site.url);

    const todayH2 = await page.waitForSelector('::-p-xpath(//h2[contains(text(), "Today")])');
    const todayDivEl = await todayH2.getProperty('parentNode');

    const flavorsOfTheDay = await todayDivEl.$$eval('.flavor-card h3', options => {
        return options.map(option => option.textContent);
      });
    //console.log(flavorsOfTheDay);

    await page.close();
    return flavorsOfTheDay.join(',');
}
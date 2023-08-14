import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { MkeFrozenTreatsImporter } from "../import.d.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Kopps');
    const page = await browser.newPage();
    await page.goto(site.url);

    const todayH2 = await page.waitForXPath(`//h2[contains(text(), "Today")]`);
    const todayDivEl = await todayH2.getProperty('parentNode');

    const flavorsOfTheDay = await todayDivEl.$$eval('.flavor-card h3', options => {
        return options.map(option => option.textContent);
      });
    console.log(flavorsOfTheDay);

    await browser.close();

    return flavorsOfTheDay.join(',');
}
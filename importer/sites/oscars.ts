import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { MkeFrozenTreatsImporter } from "../import.d.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    const page = await browser.newPage();
    await page.goto(site.url);

    //get today's date
    const today = new Date();
    const weekDay = today.toLocaleString('en-US', {weekday: 'short'});
    const date = `${weekDay} ${today.getDate()}`;

    const todayTd = await page.waitForXPath(`//td[contains(text(), "${date}")]`);
    const todayTr = await todayTd.getProperty('parentNode');
    const flavorTd = await todayTr.waitForSelector(`td:nth-child(2)`);
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorTd: any) => flavorTd.textContent,
        flavorTd
    );

    await browser.close();

    return flavorOfTheDay;
}
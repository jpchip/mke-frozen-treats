/// <reference types="https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.d.ts" />
import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { time } from "https://denopkg.com/burhanahmeed/time.ts@v2.0.1/mod.ts";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Oscars...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');
    await page.goto(site.url);

    //get today's date
    const today = time().tz('America/Chicago').t;
    const weekDay = today.toLocaleString('en-US', {weekday: 'short'});
    const date = `${weekDay} ${today.getDate()}`;

    let todayTd;
    try{ 
        todayTd = await page.waitForXPath(`//td[contains(text(), "${date}")]`, { timeout: 2000 });
    }catch(_e) {
        if (weekDay === 'Thu') {
            todayTd = await page.waitForXPath(`//td[contains(text(), "Thur ${today.getDate()}")]`, { timeout: 2000 });
        }
    }

    const todayTr = await todayTd.getProperty('parentNode');
    const flavorTd = await todayTr.waitForSelector(`td:nth-child(2)`);
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorTd: any) => flavorTd.textContent,
        flavorTd
    );

    await page.close();
    return flavorOfTheDay;
}
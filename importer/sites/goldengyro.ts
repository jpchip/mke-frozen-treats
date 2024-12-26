/// <reference types="https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.d.ts" />
import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { time } from "https://denopkg.com/burhanahmeed/time.ts@v2.0.1/mod.ts";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Golden Gyro...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    //even with this user agent in place, sometimes this will fail because of Cloudflare
    await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0');
    await page.goto(site.url);
    await page.waitForTimeout(1000);

    //get today's date
    const today = time().tz('America/Chicago').t;
    const month = today.toLocaleString('en-US', {month: 'long'});
    const date = `${month} ${today.getDate()}`; 


    const h3El = await page.waitForXPath(`//h3[contains(text(), "${date}")]`, { timeout: 2000 });


    const todayDivEl = await page.evaluateHandle(element => 
        element.closest('[data-ux="Block"]'), h3El
    );


    const flavorEl = await todayDivEl.waitForSelector(`h4`);
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorEl: any) => flavorEl.textContent,
        flavorEl
    );

    return flavorOfTheDay;
}
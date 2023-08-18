/// <reference types="https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.d.ts" />
import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Bubbas...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    //even with this user agent in place, sometimes this will fail because of Cloudflare
    await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0');
    await page.goto(site.url);

    const flavorEl = await page.waitForSelector(`.fc-event-today .fc-event-title`, { timeout: 2000 });
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorEl: any) => flavorEl.textContent,
        flavorEl
    );

    return flavorOfTheDay;
}
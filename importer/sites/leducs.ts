/// <reference types="https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.d.ts" />
import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading LeDucs...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');
    await page.goto(site.url);

    await page.click('.fc-basicDay-button');
    const flavorTd = await page.waitForSelector(`.fc-content`);
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorTd: any) => flavorTd.textContent,
        flavorTd
    );

    return flavorOfTheDay;
}
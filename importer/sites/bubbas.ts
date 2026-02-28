/// <reference types="https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.d.ts" />
import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Bubbas...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set modern user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
    });
    
    await page.goto(site.url, { waitUntil: 'networkidle2' });

    // Add a small delay to appear more human
    await page.waitForTimeout(1000);

    const flavorEl = await page.waitForSelector(`.fc-event-today .fc-event-title`, { timeout: 5000 });
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorEl: any) => flavorEl.textContent,
        flavorEl
    );

    await page.close();
    return flavorOfTheDay;
}
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
    
    // Function to add ordinal suffix to day number
    function getOrdinalSuffix(day: number): string {
        if (day > 3 && day < 21) return `${day}th`; // 4th through 20th
        switch (day % 10) {
            case 1: return `${day}st`;
            case 2: return `${day}nd`;
            case 3: return `${day}rd`;
            default: return `${day}th`;
        }
    }
    
    const dayWithSuffix = getOrdinalSuffix(today.getDate());
    const date = `${month.toUpperCase()}${dayWithSuffix.toUpperCase()}`;
    
    // Try with full ordinal suffix first, then fall back to just "T"
    let flavorEl;
    try {
        flavorEl = await page.waitForSelector(`[data-aid="MENU_CATEGORY_${date}"] [data-ux="HeadingMinor"]`, { timeout: 2000 });
    } catch (e) {
        // If the full suffix doesn't work, try with just the day + "T"
        const dayNumber = today.getDate();
        const dateWithT = `${month.toUpperCase()}${dayNumber}T`;
        flavorEl = await page.waitForSelector(`[data-aid="MENU_CATEGORY_${dateWithT}"] [data-ux="HeadingMinor"]`, { timeout: 2000 });
    }
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorEl: any) => flavorEl.textContent,
        flavorEl
    );

    return flavorOfTheDay;
}
/// <reference types="https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.d.ts" />
import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Roberts...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    await page.goto(site.url);

    const flavorOfTheDay = await page.evaluate(() => {
        // Find the h1 with "Flavor Calendar"
        const h1 = Array.from(document.querySelectorAll('h1')).find(
            h => h.textContent?.includes('Flavor Calendar')
        );
        
        if (!h1) return null;
        
        // Get today's date formatted like "Sun, October 26, 2025"
        const today = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/Chicago'
        });
        const todayStr = formatter.format(today);
        
        // Find the ul sibling and search for li with today's date
        const ul = h1.parentElement?.querySelector('ul');
        if (!ul) return null;
        
        const lis = Array.from(ul.querySelectorAll('li'));
        const todayLi = lis.find(li => li.textContent?.includes(todayStr));
        
        if (!todayLi) return null;
        
        // Extract just the flavor name (text before the <br>)
        const textNode = todayLi.childNodes[0];
        return textNode?.textContent?.trim() || todayLi.textContent?.split('\n')[0].trim();
    });

    await page.close();
    return flavorOfTheDay || "Flavor not found";
}
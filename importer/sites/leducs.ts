import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading LeDucs...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');
    await page.goto(site.url);
    await new Promise(r => setTimeout(r, 1000));
    await page.click('.fc-basicDay-button');

    const flavorTd = await page.waitForSelector(`.fc-content`);
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorTd: any) => flavorTd.textContent,
        flavorTd
    );

    await page.close();
    return flavorOfTheDay;
}
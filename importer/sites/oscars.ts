import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Oscars...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');
    await page.goto(site.url);

    //get today's date
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const weekDay = today.toLocaleString('en-US', {weekday: 'short'});
    const date = `${weekDay} ${today.getDate()}`;

    let todayTd;
    try{ 
        todayTd = await page.waitForSelector(`::-p-xpath(//td[contains(text(), "${date}")])`, { timeout: 2000 });
    }catch(_e) {
        if (weekDay === 'Thu') {
            todayTd = await page.waitForSelector(`::-p-xpath(//td[contains(text(), "Thur ${today.getDate()}")])`, { timeout: 2000 });
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
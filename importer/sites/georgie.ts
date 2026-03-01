import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log('Loading Georgie Porgies...');
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    await page.goto(site.url);

    const todayH2 = await page.waitForSelector('::-p-xpath(//h2[contains(text(), "Today")])', { timeout: 2000 });
    const todayDivEl = await page.evaluateHandle(element => 
        element.closest('div.et_pb_column'), todayH2
    );
    
    
    const flavorOfTheDay = await todayDivEl.$$eval('img', options => {
        return options.map(option => option.getAttribute('alt'));
      });
    await page.close();
    if(flavorOfTheDay.length > 0) {
        const flavorOfTheDayText = flavorOfTheDay[0].replace('Flavor of the Day - ', '');
        return flavorOfTheDayText;
    }

    return '';
}
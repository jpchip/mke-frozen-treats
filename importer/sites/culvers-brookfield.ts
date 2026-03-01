import type { Browser } from "npm:puppeteer";
import { MkeFrozenTreatsImporter } from "../importer.interface.ts";

export async function load(browser: Browser, site: MkeFrozenTreatsImporter.Site): Promise<string> {
    console.log(`Loading ${site.name}`);
    const page = await browser.newPage();
    page.emulateTimezone('America/Chicago');

    await page.goto(site.url);

    const flavorEl = await page.waitForSelector(`.RestaurantDetails_containerRestaurantFlavorContentHeading__sLzcV`, { timeout: 2000 });
    
    const flavorOfTheDay = await page.evaluate(
        // deno-lint-ignore no-explicit-any
        (flavorEl: any) => flavorEl.textContent,
        flavorEl
    );

    await page.close();
    return flavorOfTheDay;
}
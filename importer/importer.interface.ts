import { Browser } from "https://deno.land/x/puppeteer@16.2.0/vendor/puppeteer-core/puppeteer/common/Browser.js";

export declare namespace MkeFrozenTreatsImporter {
    interface Site {
        name: string,
        url: string,
        script: string,
        flavorOfTheDay: string,
        locations: {
            latitude: number,
            longitude: number
        }[]
    }

    type LoadFunction = (browser: Browser, site: MkeFrozenTreatsImporter.Site) => string;
  }
import type { Browser } from "npm:puppeteer";

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
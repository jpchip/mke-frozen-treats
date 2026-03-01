import vanillaPuppeteer from "npm:puppeteer";
import { addExtra } from "npm:puppeteer-extra";
import StealthPlugin from "npm:puppeteer-extra-plugin-stealth";

// deno-lint-ignore no-explicit-any
const puppeteer = addExtra(vanillaPuppeteer as any);
puppeteer.use(StealthPlugin());
import { parseArgs } from "jsr:@std/cli@^1.0.0/parse-args";
import "jsr:@std/dotenv@^0.225.0/load";
import { putObject } from "https://raw.githubusercontent.com/skymethod/denoflare/v0.5.12/common/r2/put_object.ts";
import { getJson, writeJson } from "./helpers.ts";
import { MkeFrozenTreatsImporter } from "./importer.interface.ts";

const BROWSERLESS_TOKEN = Deno.env.get("BROWSERLESS_TOKEN");
if (BROWSERLESS_TOKEN === undefined) {
  throw new TypeError("Missing BROWSERLESS_TOKEN environment variable.");
}
const IMPORTER_MODE = Deno.env.get("IMPORTER_MODE");
if (IMPORTER_MODE === undefined) {
  throw new TypeError("Missing IMPORTER_MODE environment variable.");
}
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY");
if (R2_ACCESS_KEY === undefined) {
  throw new TypeError("Missing R2_ACCESS_KEY environment variable.");
}
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY");
if (R2_SECRET_KEY === undefined) {
  throw new TypeError("Missing R2_SECRET_KEY environment variable.");
}
const R2_ORIGIN = Deno.env.get("R2_ORIGIN");
if (R2_ORIGIN === undefined) {
  throw new TypeError("Missing R2_ORIGIN environment variable.");
}

const flags = parseArgs(Deno.args, {
  string: ["sites", "output"],
});

if (!flags.sites) {
  flags.sites = './sites.json';
}

if (!flags.output) {
  flags.output = '../site/output.json';
}


  if (flags.sites) {
    let browser;
    if (IMPORTER_MODE === 'PRODUCTION') {
      browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`,
      });
    } else {
      browser = await puppeteer.launch({
        args: ['--no-sandbox'],
      });
    }
    
    

    const siteJson = await getJson(flags.sites);
    const sites: MkeFrozenTreatsImporter.Site[] = siteJson.sites;
    
    for (const site of sites) {
        const siteScript = await import(site.script);
        try {
          const flavor = await siteScript.load(browser, site);
          site.flavorOfTheDay = flavor;
        } catch(error) {
          console.log(error);
          site.flavorOfTheDay = 'See website';
        }
        
    }
    await browser.close();
    
    siteJson.lastUpdatedOn = new Date().toUTCString();
    

    if (IMPORTER_MODE === 'PRODUCTION' || IMPORTER_MODE === 'CRON') {
	console.log('Uploading...');
      putObject({
        bucket: 'mke-frozen-treats',
        key: 'flavorsOfTheDay.json',
        body: JSON.stringify(siteJson),
        origin: R2_ORIGIN,
        region: 'enam',
        contentType: 'application/json'
    }, { credentials: { 
            accessKey: R2_ACCESS_KEY, 
            secretKey: R2_SECRET_KEY, 
        },
        userAgent: '',
        unsignedPayload: true
        });
    } else {
      writeJson(flags.output, siteJson);
    }
  }



import puppeteer from "https://deno.land/x/puppeteer@16.2.0/mod.ts";
import { parse } from "https://deno.land/std@0.194.0/flags/mod.ts";
import { getJson, writeJson } from "./helpers.ts";
import { MkeFrozenTreatsImporter } from "./import.d.ts";

const flags = parse(Deno.args, {
    string: ["sites"],
  });
  console.log(flags.sites);

const browser = await puppeteer.launch();

const siteJson = await getJson('./sites.json');
const sites: MkeFrozenTreatsImporter.Site[] = siteJson.sites;

for (const site of sites) {
    const siteScript = await import(site.script);
    const flavor = await siteScript.load(browser, site);
    site.flavorOfTheDay = flavor;
    console.log(flavor);
}

siteJson.lastUpdatedOn = new Date().toUTCString();

console.log(siteJson);

writeJson('./output.json', siteJson)


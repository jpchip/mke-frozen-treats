# MKE Frozen Treats Importer

## Install Chrome:

```
deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts
```

## Notes on site scripts

Gille's ([sites/gilles.ts](sites/gilles.ts)) publishes its flavor calendar as a single monthly image rather than HTML, so that script downloads the image and runs it through [`tesseract.js`](https://www.npmjs.com/package/tesseract.js) (a WASM build of Tesseract, no system binary required) to OCR out today's flavor. Each run downloads the `eng` OCR traineddata (a few MB) from `cdn.jsdelivr.net`, so the runtime needs outbound network access to that host in addition to the sites being scraped.

Robert's ([sites/roberts.ts](sites/roberts.ts)) also publishes a monthly flavor list as a scan, embedded on its page as a PDF that wraps one JPEG per page. That script pulls the JPEGs out of the PDF, OCRs the page headed "`<MONTH> FLAVOR LIST`" with `tesseract.js`, re-OCRs only the flavor column, and maps entries to days using the day numbers where legible (counting forward where a "BOOSTER" / "NEW FLAVOR ALERT" box hides them). It returns `?` if the sheet is for a different month than today. OCR adds roughly 5-15 seconds per run.

## Setup Environment Variables

Copy `importer/.env.example` to `.env`. You don't need to touch it beyond that unless you want to make use of browserless.io for scraping and R2 for storing the file. If you want to use browserless.io, you'll need to sign up for an account and get your own API key. Set `IMPORTER_MODE` to `PRODUCTION` in the `.env` file to use the R2 bucket and browserless.io.

## Run script:

```
deno run -A --unstable importer.ts --sites ./sites.json
```

Generates ../sites/output.json by default, by output can be configured with:

```
deno run -A --unstable importer.ts --sites ./sites.json --output someOtherPlace.json
```
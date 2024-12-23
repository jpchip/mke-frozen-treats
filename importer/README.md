# MKE Frozen Treats Importer

## Install Chrome:

```
deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts
```

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
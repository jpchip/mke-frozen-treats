# MKE Frozen Treats 🍦
> Flavor of the Day Tracker

This application lists the flavor of the day at Frozen Custard vendors around the MKE area.

## Installing / Getting started

Consists of two pieces, the importer script and the site. See the readme in each directory for more details on each.

The gist though is this: 

1. run the importer to pull in the flavor of the day from all the sites defined in `sites.json` (or you can point to another file).

```shell
deno run -A --unstable importer.ts --sites ./sites.json
```

2. Launch the server to view the outputted flavors in a website:

```shell
deno run --allow-net --allow-read server.ts
```

## Developing

### Built With

- Deno
- Puppeteer
- alpinejs
- bootstrap
- axios

### Prerequisites

- Deno 1.36.1

### Setting up Dev

Install Chrome for Puppeteer:

```shell
deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts
```

Copy `importer/.env.example` to `.env`. You don't need to touch it beyond that unless you want to make use of browserless.io for scraping and R2 for storing the file.

### Building

Right now the `index.html` is hard coded to my flavorOfTheDay.json file on R2. To use a local copy or your own, replace the url as needed. 

### Deploying / Publishing

The importer needs as a cronjob or some other timer to generate a new file daily.

The website can run anywhere, it just needs to point to the json file generated by the importer.

## Versioning

We can maybe use [SemVer](http://semver.org/) for versioning. For the versions available, see the [link to tags on this repository](/tags).


## Configuration

### Importing Frozen Custard Sites

The site the Importer pulls from are defined in the `sites.json`. Each site needs a corresponding script file that returns the flavor of the day. These scripts file should export a `load` function in the format of:

```
type LoadFunction = (browser: Browser, site: MkeFrozenTreatsImporter.Site) => string;
```

By default the importer loads up the site.json

## Tests

```
deno test --allow-read
```

## Style guide

Uses Deno lint in VS Code

## Licensing

See LICENSE file
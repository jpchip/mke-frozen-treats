# MKE Frozen Treats Importer

Install Chrome:

```
deno run -A --unstable https://deno.land/x/puppeteer@16.2.0/install.ts
```

Run script:

```
deno run -A --unstable importer.ts --sites ./sites.json
```

Generates ../sites/output.json by default, by output can be configured with:

```
deno run -A --unstable importer.ts --sites ./sites.json --output someOtherPlace.json
```
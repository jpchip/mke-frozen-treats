import { serveDir, serveFile } from "jsr:@std/http@^1.0.0/file-server";
import { exists } from "jsr:@std/fs@^1.0.0/exists";
import { Eta } from "jsr:@eta-dev/eta@^3.5.0";
import "jsr:@std/dotenv@^0.225.0/load";

const FLAVORS_OF_THE_DAY_URL = Deno.env.get("FLAVORS_OF_THE_DAY_URL");
if (FLAVORS_OF_THE_DAY_URL === undefined) {
  throw new TypeError("Missing FLAVORS_OF_THE_DAY_URL environment variable.");
}
// Re-typed as `string` (vs. `string | undefined`) so it can be used inside
// nested functions below without further null checks.
const FLAVORS_URL: string = FLAVORS_OF_THE_DAY_URL;

interface FlavorSite {
  name: string;
  url: string;
  flavorOfTheDay: string;
  locations: { latitude: number; longitude: number }[];
}

interface FlavorsPayload {
  sites: FlavorSite[];
  lastUpdatedOn: string;
}

const EMPTY_PAYLOAD: FlavorsPayload = { sites: [], lastUpdatedOn: "" };

// Cache the flavors payload for a short time so server-side rendering doesn't
// hit the remote JSON (or local disk) on every single request.
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let cachedFlavors: { data: FlavorsPayload; fetchedAt: number } | null = null;

async function getFlavorsData(): Promise<FlavorsPayload> {
  const now = Date.now();
  if (cachedFlavors && now - cachedFlavors.fetchedAt < CACHE_TTL_MS) {
    return cachedFlavors.data;
  }

  try {
    let data: FlavorsPayload;
    if (/^https?:\/\//i.test(FLAVORS_URL)) {
      const res = await fetch(FLAVORS_URL);
      data = await res.json();
    } else {
      const text = await Deno.readTextFile(`${Deno.cwd()}/output.json`);
      data = JSON.parse(text);
    }
    cachedFlavors = { data, fetchedAt: now };
    return data;
  } catch (error) {
    console.error("Failed to load flavors data for SSR:", error);
    return cachedFlavors?.data ?? EMPTY_PAYLOAD;
  }
}

// Independent custard stands read as more relevant local search results than
// the long tail of Culver's locations, so they're listed first.
function sortSitesForDisplay(sites: FlavorSite[]): FlavorSite[] {
  return [...sites].sort((a, b) => {
    const aIsCulvers = a.name.startsWith("Culver's");
    const bIsCulvers = b.name.startsWith("Culver's");
    if (aIsCulvers !== bIsCulvers) return aIsCulvers ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

const port = parseInt(Deno.env.get("PORT") ?? "8080");
Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/favicon.ico") {
    return serveFile(req, `${Deno.cwd()}/favicon.ico`);
  }

  if (pathname === "/manifest.json") {
    return serveFile(req, `${Deno.cwd()}/manifest.json`);
  }

  if (pathname === "/index.js") {
    return serveFile(req, `${Deno.cwd()}/index.js`);
  }

  if (pathname === "/service_worker.js") {
    return serveFile(req, `${Deno.cwd()}/service_worker.js`);
  }

  if (pathname.startsWith("/images")) {
    return serveDir(req, {
      urlRoot: "images",
      fsRoot: "images",
    });
  }

  if (pathname === "/flavorsOfTheDay.json") {
    return serveFile(req, `${Deno.cwd()}/output.json`);
  }

  // Google Search Console site-verification files (e.g. google<token>.html)
  // need to be served from the root as plain static files.
  if (/^\/google[a-z0-9]+\.html$/i.test(pathname)) {
    const filePath = `${Deno.cwd()}${pathname}`;
    if (await exists(filePath)) {
      return serveFile(req, filePath);
    }
  }

  if (pathname === "/robots.txt") {
    const body = [
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: ${url.origin}/sitemap.xml`,
      "",
    ].join("\n");
    return new Response(body, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (pathname === "/sitemap.xml") {
    const flavors = await getFlavorsData();
    const lastmod = flavors.lastUpdatedOn
      ? new Date(flavors.lastUpdatedOn).toISOString()
      : new Date().toISOString();
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url>\n` +
      `    <loc>${url.origin}/</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>daily</changefreq>\n` +
      `    <priority>1.0</priority>\n` +
      `  </url>\n` +
      `</urlset>\n`;
    return new Response(body, {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }

  if (pathname === "/") {
    const flavors = await getFlavorsData();
    const sites = sortSitesForDisplay(flavors.sites);
    const canonicalUrl = `${url.origin}/`;

    const eta = new Eta({ views: `${Deno.cwd()}/templates` });
    const res = eta.render("./index", {
      sites,
      lastUpdatedOn: flavors.lastUpdatedOn,
      canonicalUrl,
      // Escape "<" so a flavor name/description can never prematurely close
      // the <script> tag this gets embedded in.
      flavorsJson: JSON.stringify({
        sites,
        lastUpdatedOn: flavors.lastUpdatedOn,
      })
        .replace(/</g, "\\u003c"),
    });
    return new Response(res, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return new Response(`404: The Page (${pathname}) is Not Found`, {
    status: 404,
  });
});

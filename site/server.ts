import { serveFile, serveDir } from "https://deno.land/std@0.194.0/http/file_server.ts";
import { Eta } from "https://deno.land/x/eta@v3.0.3/src/index.ts"
import "https://deno.land/std@0.198.0/dotenv/load.ts";

const FLAVORS_OF_THE_DAY_URL = Deno.env.get("FLAVORS_OF_THE_DAY_URL");
if (FLAVORS_OF_THE_DAY_URL === undefined) {
  throw new TypeError("Missing FLAVORS_OF_THE_DAY_URL environment variable.");
}

Deno.serve({port: 80}, (req: Request) => {
    const pathname = new URL(req.url).pathname;

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
          fsRoot: 'images'
        });
      }

    if (pathname === "/flavorsOfTheDay.json") {
        return serveFile(req, `${Deno.cwd()}/output.json`);      
    }

    if (pathname === "/") {
        const eta = new Eta({ views: `${Deno.cwd()}/templates` });
        const res = eta.render("./index", { FLAVORS_OF_THE_DAY_URL: FLAVORS_OF_THE_DAY_URL });
        return new Response(res, {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
        //return serveFile(req, `${Deno.cwd()}/index.html`);
    }

    return new Response(`404: The Page (${pathname}) is Not Found`, {
        status: 404,
      });
});

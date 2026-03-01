import { serveFile, serveDir } from "jsr:@std/http@^1.0.0/file-server";
import { Eta } from "jsr:@eta-dev/eta@^3.5.0";
import "jsr:@std/dotenv@^0.225.0/load";

const FLAVORS_OF_THE_DAY_URL = Deno.env.get("FLAVORS_OF_THE_DAY_URL");
if (FLAVORS_OF_THE_DAY_URL === undefined) {
  throw new TypeError("Missing FLAVORS_OF_THE_DAY_URL environment variable.");
}

const port = parseInt(Deno.env.get("PORT") ?? "8080");
Deno.serve({port}, (req: Request) => {
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

import { serveFile, serveDir } from "https://deno.land/std@0.194.0/http/file_server.ts";

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
        return serveFile(req, `${Deno.cwd()}/index.html`);
    }

    return new Response(`404: The Page (${pathname}) is Not Found`, {
        status: 404,
      });
});

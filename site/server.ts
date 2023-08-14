import { serveFile } from "https://deno.land/std@0.194.0/http/file_server.ts";

Deno.serve({port: 80}, (req: Request) => {
    const pathname = new URL(req.url).pathname;

    if (pathname === "/favicon.ico") {
        return serveFile(req, `${Deno.cwd()}/favicon.ico`);
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

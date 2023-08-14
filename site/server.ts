import { serveDir, serveFile } from "https://deno.land/std@0.194.0/http/file_server.ts";

Deno.serve({port: 80}, (req: Request) => {
    const pathname = new URL(req.url).pathname;

    if (pathname === "/favicon.ico") {
        return serveFile(req, "../importer/output.json");
    }

    if (pathname === "/flavors.json") {
        return serveFile(req, "../importer/output.json");
    }

    if (pathname === "/") {
        return serveFile(req, "./index.html");
    }

    return new Response("404: Not Found", {
        status: 404,
      });
});

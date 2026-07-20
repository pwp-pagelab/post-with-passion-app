import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createAgentsMiddleware } from "./agents.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const port = Number(process.env.PORT || 4173);
const agents = createAgentsMiddleware({
  googleFontsApiKey: process.env.GOOGLE_FONTS_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5"
});

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2"
};

function serve(req, res) {
  if (!existsSync(dist)) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Production build missing. Run pnpm build first.");
  }
  const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  let file = resolve(dist, requested);
  if (file !== dist && !file.startsWith(`${dist}${sep}`)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = resolve(dist, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=31536000, immutable" });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => agents(req, res, () => serve(req, res)));
server.listen(port, "0.0.0.0", () => console.log(`Post With Passion running on port ${port}`));

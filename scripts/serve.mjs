/**
 * Production start (Replit deployment run command).
 *
 * Replit health-checks "/" a few seconds after starting the run command and stops the deployment
 * if nothing answers. The start steps (database backup, migrations, Shangri-La import) take longer
 * than that, so this server opens the port at once and runs them while it is already listening:
 *
 *   1. listen on PORT immediately;
 *   2. backup (never blocks: errors and a 90 s timeout are ignored) → migrations (must succeed)
 *      → Shangri-La import (--if-missing, never blocks);
 *   3. prepare Next.js in this same process and hand it every request (no gap, no second port).
 *
 * While starting, "/" answers at once with a small 200 page that reloads itself (so the health
 * check passes); other requests wait up to 8 s for the app, then get a 503 with Retry-After.
 * If the migrations fail, the process exits with an error: the previous version keeps serving.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { parse } from "node:url";
import next from "next";

const port = Number(process.env.PORT || 5000);
const hostname = "0.0.0.0";
const HOLD_MS = 8_000;

let handle = null; // Next request handler once ready
const waiting = new Set();

const starting = (req, res) => {
  if (res.headersSent) return;
  if (req.url === "/" || req.url?.startsWith("/?")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" });
    res.end(
      '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<meta http-equiv="refresh" content="3"><title>RestoCool</title>' +
        '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#0b3d26;background:#fff8ec">' +
        "<p>RestoCool démarre… · Starting…</p></body></html>",
    );
  } else {
    res.writeHead(503, { "retry-after": "5", "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("RestoCool démarre, réessayez dans quelques secondes. Starting, try again in a few seconds.");
  }
};

const server = http.createServer((req, res) => {
  if (handle) return handle(req, res, parse(req.url ?? "/", true));
  // The health check (and anyone opening the home page) gets an answer right away.
  if (req.url === "/" || req.url?.startsWith("/?")) return starting(req, res);
  const entry = { req, res };
  waiting.add(entry);
  entry.timer = setTimeout(() => {
    waiting.delete(entry);
    starting(req, res);
  }, HOLD_MS);
  res.on("close", () => {
    clearTimeout(entry.timer);
    waiting.delete(entry);
  });
});

server.listen(port, hostname, () => console.log(`▶ listening on ${hostname}:${port} (starting)`));

function run(label, args, { timeoutMs, optional }) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", ...args], { stdio: "inherit", env: process.env });
    const timer = timeoutMs
      ? setTimeout(() => {
          console.warn(`! ${label}: no answer after ${timeoutMs / 1000} s, skipped`);
          child.kill("SIGTERM");
        }, timeoutMs)
      : null;
    child.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) return resolve();
      if (optional) {
        console.warn(`! ${label} did not finish (code ${code}); continuing`);
        return resolve();
      }
      reject(new Error(`${label} failed (code ${code})`));
    });
    child.on("error", (err) => (optional ? resolve() : reject(err)));
  });
}

async function main() {
  await run("backup", ["db:backup"], { timeoutMs: 90_000, optional: true });
  await run("migrations", ["db:migrate"], {});
  await run("Shangri-La import", ["import:shangri-la", "--", "--if-missing"], { timeoutMs: 120_000, optional: true });

  const app = next({ dev: false, hostname, port, dir: process.cwd(), httpServer: server });
  await app.prepare();
  handle = app.getRequestHandler();
  const upgrade = app.getUpgradeHandler?.();
  if (upgrade) server.on("upgrade", (req, socket, head) => upgrade(req, socket, head));
  for (const { req, res, timer } of waiting) {
    clearTimeout(timer);
    handle(req, res, parse(req.url ?? "/", true));
  }
  waiting.clear();
  console.log("✓ RestoCool ready");
}

main().catch((err) => {
  console.error(`✗ start failed: ${err instanceof Error ? err.message : err}`);
  for (const { req, res } of waiting) starting(req, res);
  server.close();
  process.exit(1);
});

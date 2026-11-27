/**
 * Production start (Replit deployment run command).
 *
 * One small front server owns PORT for the whole life of the deployment; Next.js runs behind it
 * on an internal port. So the public port never closes, not even for a second, and a visitor who
 * taps or refreshes while a new version starts simply waits a little instead of getting
 * « Internal Server Error »:
 *
 *   1. listen on PORT immediately (Replit health-checks "/" within seconds);
 *   2. backup (never blocks: errors and a 90 s timeout are ignored) → migrations (must succeed)
 *      → prepared-business imports (--if-missing, never block);
 *   3. start `next start` on 127.0.0.1 (a free port chosen by the system, or INTERNAL_PORT), wait
 *      until it answers (any status; 90 s at most), warm the main pages, then forward every request
 *      to it (headers untouched, streams included). If Next.js stops, it is restarted (5 times at
 *      most) while the public port stays open.
 *
 * While starting: "/" answers at once with a small page that reloads itself (the health check
 * passes); every other request is held until the app is ready (up to HOLD_MS), then forwarded.
 * Past that, pages get a friendly self-reloading « mise à jour » page and APIs a 503 with
 * Retry-After (the apps already retry / queue on their own).
 * If the migrations fail, the process exits with an error: the previous version keeps serving.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const port = Number(process.env.PORT || 5000);
const hostname = "0.0.0.0";
let internalPort = Number(process.env.INTERNAL_PORT || 0); // 0 = a free port chosen by the system
// « localhost », not 127.0.0.1: Next.js names its own address « localhost »; with another name, the
// sign-in middleware's rewrite looks like an outside site and Next proxies it over https (500).
const internalHost = "localhost";
const HOLD_MS = 30_000;

let ready = false;
let app = null;
const waiting = new Set();

const wantsHtml = (req) => req.method === "GET" && (req.headers.accept ?? "").includes("text/html") && !req.headers.rsc;

const waitPage = (title, text) =>
  '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  `<meta http-equiv="refresh" content="3"><title>${title}</title>` +
  '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#0b3d26;background:#fff8ec;text-align:center">' +
  `<div><p style="font-size:18px;font-weight:600">${text}</p><p style="color:#5b6b60">Cette page se recharge toute seule · This page reloads by itself</p></div></body></html>`;

/** The answer while the app is not there (start, or a crash being restarted by Replit). */
function notReady(req, res) {
  if (res.headersSent || res.writableEnded) return;
  const bot = PREVIEW_BOT.test(req.headers["user-agent"] ?? "");
  if (!bot && (req.url === "/" || req.url?.startsWith("/?") || wantsHtml(req))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" });
    res.end(waitPage("RestoCool", "RestoCool se met à jour… · Updating…"));
  } else {
    res.writeHead(503, { "retry-after": "5", "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("RestoCool se met à jour, réessayez dans quelques secondes. Updating, try again in a few seconds.");
  }
}

/** Forwards one request to Next.js, untouched (headers, body, streamed answers such as SSE). */
function forward(req, res) {
  const upstream = http.request(
    { host: internalHost, port: internalPort, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.statusMessage, up.rawHeaders);
      up.pipe(res);
    },
  );
  upstream.on("error", () => notReady(req, res));
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

function hold(req, res) {
  const entry = { req, res };
  waiting.add(entry);
  entry.timer = setTimeout(() => {
    waiting.delete(entry);
    notReady(req, res);
  }, HOLD_MS);
  res.on("close", () => {
    clearTimeout(entry.timer);
    waiting.delete(entry);
  });
}

// Link-preview and search robots: they keep the first page they get (often for days), so during a
// restart they wait for the real page (with its share image) instead of the waiting page.
const PREVIEW_BOT = /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|pinterest|redditbot|embedly|googlebot|bingbot|applebot|yandex|duckduckbot|snapchat|viber|instagram/i;

const server = http.createServer((req, res) => {
  if (ready) return forward(req, res);
  // The health check (and people opening the home page) get an answer right away.
  if ((req.url === "/" || req.url?.startsWith("/?")) && !PREVIEW_BOT.test(req.headers["user-agent"] ?? "")) return notReady(req, res);
  hold(req, res);
});
server.keepAliveTimeout = 65_000; // longer than the platform proxy's, so it never reuses a closed socket
server.headersTimeout = 66_000;
server.requestTimeout = 0; // live streams (SSE) stay open

// WebSocket / upgrade requests (none today): passed straight through once ready.
server.on("upgrade", (req, socket, head) => {
  if (!ready) return socket.destroy();
  const up = net.connect(internalPort, internalHost, () => {
    up.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) up.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    up.write("\r\n");
    if (head?.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
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

/** One GET to the internal app; resolves with the status (0 when it does not answer). */
function probe(path, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const req = http.get({ host: internalHost, port: internalPort, path, headers: { accept: "text/html", "user-agent": "restocool-warmup" } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(0));
  });
}

/** A free local port, chosen by the system (never one another process already holds). */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, internalHost, () => {
      const { port: p } = s.address();
      s.close(() => resolve(p));
    });
  });
}

let stopping = false;
let restarts = 0;

/** Starts Next.js behind the front server; restarts it if it stops (the public port stays open). */
function startNext() {
  console.log(`▶ starting Next.js on ${internalHost}:${internalPort}`);
  app = spawn("npx", ["next", "start", "-H", internalHost, "-p", String(internalPort)], { stdio: "inherit", env: { ...process.env, PORT: String(internalPort) } });
  app.on("exit", (code, signal) => {
    if (stopping) return process.exit(code ?? 0);
    ready = false;
    restarts++;
    console.error(`✗ Next.js stopped (${code ?? signal}), restart ${restarts}`);
    if (restarts > 5) process.exit(1);
    setTimeout(() => void boot(), 1_000);
  });
}

/** Waits until Next.js answers (any status: it is up), warms the main pages, then forwards. */
async function boot() {
  if (!process.env.INTERNAL_PORT || restarts > 0) internalPort = await freePort();
  startNext();
  const t0 = Date.now();
  let last = -1;
  for (;;) {
    const status = await probe("/api/health", 3_000);
    if (status !== last) console.log(`  Next.js /api/health → ${status || "no answer yet"}`);
    last = status;
    if (status > 0) break;
    // Never stay on the waiting page: after 90 s, forward anyway (errors still get the friendly page).
    if (Date.now() - t0 > 90_000) {
      console.error("! Next.js did not answer within 90 s: forwarding anyway");
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (last > 0) await Promise.all(["/", "/restaurants", "/sign-in"].map((p) => probe(p)));
  ready = true;
  console.log(`✓ RestoCool serving (ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${waiting.size} waiting request(s) released)`);
  for (const entry of waiting) {
    clearTimeout(entry.timer);
    forward(entry.req, entry.res);
  }
  waiting.clear();
}

async function main() {
  await run("backup", ["db:backup"], { timeoutMs: 90_000, optional: true });
  await run("migrations", ["db:migrate"], {});
  await run("Shangri-La import", ["import:shangri-la", "--", "--if-missing"], { timeoutMs: 120_000, optional: true });
  await run("La Terrace import", ["import:la-terrace", "--", "--if-missing"], { timeoutMs: 60_000, optional: true });
  console.log("✓ database ready");
  await boot();
}

// Replit stops the old version with SIGTERM: finish the requests in progress, then stop.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    stopping = true;
    server.close();
    if (app) app.kill(sig);
    else process.exit(0);
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

main().catch((err) => {
  console.error(`✗ start failed: ${err instanceof Error ? err.message : err}`);
  for (const { req, res } of waiting) notReady(req, res);
  server.close();
  app?.kill("SIGTERM");
  process.exit(1);
});

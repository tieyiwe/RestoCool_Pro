import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

/** Changes on every deploy, so a new deploy installs a new worker and old caches are dropped. */
function buildId(): string {
  try {
    return readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return process.env.REPLIT_DEPLOYMENT_ID ?? "dev";
  }
}

/**
 * Service worker for public menus only (scope /r/). The staff app gets its own later (M4/M5).
 * - Pages: network first, cached copy when offline.
 * - Next.js static files and images: cache first (they are immutable / content-addressed).
 */
function script(version: string): string {
  return `
const VERSION = ${JSON.stringify(version)};
const PAGES = "rc-menu-pages-" + VERSION;
const STATIC = "rc-menu-static-" + VERSION;
const IMAGES = "rc-menu-images-v1";
const MAX_IMAGES = 250;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("rc-menu-") && key !== PAGES && key !== STATIC && key !== IMAGES) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    if (cacheName === IMAGES) trim(IMAGES, MAX_IMAGES);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && url.pathname.startsWith("/r/")) return event.respondWith(networkFirst(req));
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith("/api/media/") || url.pathname.startsWith("/demo/") || url.pathname.startsWith("/brand/")) {
    return event.respondWith(cacheFirst(req, IMAGES));
  }
});
`;
}

export function GET() {
  return new Response(script(buildId()), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/r/",
    },
  });
}

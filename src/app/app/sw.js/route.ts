import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

function buildId(): string {
  try {
    return readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return process.env.REPLIT_DEPLOYMENT_ID ?? "dev";
  }
}

/** Shown when a staff page is opened without network (no business data is ever cached). */
const OFFLINE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RestoCool · hors ligne</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF6EC;color:#17231C;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}main{max-width:22rem}h1{font-size:1.4rem}p{color:#4b5563}button{min-height:48px;padding:0 20px;border:0;border-radius:12px;background:#0F6B3E;color:#fff;font-weight:700;font-size:1rem}</style></head>
<body><main><h1>📶 Pas de connexion</h1><p>Vérifiez le Wi-Fi ou les données mobiles, puis réessayez.</p><p lang="en">No connection. Check Wi-Fi or mobile data and try again.</p><p lang="zh">没有网络连接。请检查 Wi-Fi 或移动数据后重试。</p><button onclick="location.reload()">Réessayer · Retry · 重试</button></main></body></html>`;

/**
 * Service worker for the staff app (scope /app/).
 * - Next.js static files: cache first (content-addressed), so screens open instantly after the first time.
 * - Pages and APIs: always the network (orders, personnel and money are never served stale or
 *   kept on the device); when offline, a clear « Pas de connexion » page.
 */
function script(version: string): string {
  return `
const VERSION = ${JSON.stringify(version)};
const STATIC = "rc-app-static-" + VERSION;
const OFFLINE = ${JSON.stringify(OFFLINE_HTML)};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("rc-app-") && key !== STATIC) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
  }
});
`;
}

export function GET() {
  return new Response(script(buildId()), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/app/",
    },
  });
}

import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { isShortMapsLink, latLngFromText, placeUrl, round, validLatLng, type LatLng } from "@/lib/location/parse";
import { log } from "@/lib/log";
import type { SettingsCtx } from "./settings";

export const GpsInput = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  accuracyM: z.number().finite().min(0).max(100_000).optional(),
});

export class LocationError extends Error {
  constructor(public readonly code: "invalid" | "no_coordinates" | "too_imprecise") {
    super(code);
  }
}

/** GPS readings worse than this are refused: they would send customers to the wrong street. */
export const MAX_ACCURACY_M = 500;

async function save(ctx: SettingsCtx, p: LatLng, source: "gps" | "link", accuracyM: number | null) {
  const rid = ctx.repo.restaurantId;
  await ctx.db
    .update(restaurants)
    .set({
      latitude: round(p.lat),
      longitude: round(p.lng),
      locationAccuracyM: accuracyM === null ? null : Math.round(accuracyM),
      locationSource: source,
      locationSetAt: new Date(),
      // Customers' « Itinéraire » link follows the saved point.
      gmapsUrl: placeUrl(p),
    })
    .where(eq(restaurants.id, rid));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "settings.location", entity: "restaurant", entityId: rid, data: { source, accuracyM } });
}

/** The owner is at the business: save the phone's position (after the on-screen warning). */
export async function saveGpsLocation(ctx: SettingsCtx, input: z.input<typeof GpsInput>) {
  const p = GpsInput.safeParse(input);
  if (!p.success || !validLatLng(p.data.lat, p.data.lng)) throw new LocationError("invalid");
  if (p.data.accuracyM !== undefined && p.data.accuracyM > MAX_ACCURACY_M) throw new LocationError("too_imprecise");
  await save(ctx, { lat: p.data.lat, lng: p.data.lng }, "gps", p.data.accuracyM ?? null);
}

/** Google hosts a short link may redirect through (we never follow anything else). */
const GOOGLE_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com", "www.google.bf", "maps.google.bf"]);

/**
 * Coordinates from a pasted Google Maps link. Long links are read directly; short share links
 * (« maps.app.goo.gl/… ») are opened on the server, following at most 4 redirects, only on Google.
 */
export async function coordinatesFromLink(raw: string): Promise<LatLng | null> {
  const text = raw.trim().slice(0, 2000);
  const direct = latLngFromText(text);
  if (direct) return direct;
  if (!isShortMapsLink(text)) return null;
  let url = text;
  for (let hop = 0; hop < 4; hop++) {
    let next: string | null = null;
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0 (RestoCool location check)" } });
      next = res.headers.get("location");
      if (!next) {
        // Some pages put the coordinates in the final HTML instead of a redirect.
        const body = res.status < 400 ? (await res.text()).slice(0, 200_000) : "";
        return latLngFromText(body.match(/https:\/\/www\.google\.[a-z.]+\/maps[^"'\s<>]+/)?.[0] ?? "") ?? null;
      }
    } catch (err) {
      log.warn("location.link_resolve_failed", { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
    const abs = new URL(next, url);
    if (abs.protocol !== "https:" || !GOOGLE_HOSTS.has(abs.hostname)) return null;
    url = abs.toString();
    const found = latLngFromText(decodeURIComponent(url));
    if (found) return found;
  }
  return null;
}

export async function saveLinkLocation(ctx: SettingsCtx, link: string) {
  const p = await coordinatesFromLink(link);
  if (!p) throw new LocationError("no_coordinates");
  await save(ctx, p, "link", null);
}

export async function clearLocation(ctx: SettingsCtx) {
  const rid = ctx.repo.restaurantId;
  await ctx.db
    .update(restaurants)
    .set({ latitude: null, longitude: null, locationAccuracyM: null, locationSource: null, locationSetAt: null })
    .where(eq(restaurants.id, rid));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "settings.location.cleared", entity: "restaurant", entityId: rid });
}

import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { trafficMinutes, trafficVisitors } from "@/db/schema";
import { log } from "@/lib/log";
import type { Device, Os } from "./device";
import { usageDay } from "./track";

export type Audience = "owner" | "manager" | "staff" | "customer" | "visitor";
export const AUDIENCES: Audience[] = ["owner", "manager", "staff", "customer", "visitor"];
export const DEVICES: Device[] = ["phone", "tablet", "desktop"];

type Entry = { audience: Audience; device: Device; os: Os; standalone: boolean; restaurantId: string | null; at: number };
type State = { live: Map<string, Entry>; seenToday: Set<string>; day: string; timer: ReturnType<typeof setInterval> | null };

/** Who has a screen open right now, in this server process (one long-lived process: Reserved VM). */
const g = globalThis as unknown as { __rcPresence?: State };
const state: State = (g.__rcPresence ??= { live: new Map(), seenToday: new Set(), day: usageDay(), timer: null });

export const LIVE_MS = 2 * 60_000;

/** Anonymous key: a hash, never the raw id. */
export const visitorKey = (raw: string) => createHash("sha256").update(`rc-visitor:${raw}`).digest("base64url").slice(0, 22);

/** A heartbeat: keep the person in « live now » and count them once per day. */
export function touchPresence(key: string, e: Omit<Entry, "at">) {
  const now = Date.now();
  state.live.set(`${key}:${e.audience}`, { ...e, at: now });
  // Never let the map grow without bound (bots…): drop the oldest entries.
  if (state.live.size > 50_000) prune(now);
  const day = usageDay();
  if (day !== state.day) {
    state.day = day;
    state.seenToday.clear();
  }
  const seen = `${key}:${e.audience}`;
  if (!state.seenToday.has(seen)) {
    state.seenToday.add(seen);
    void getDb()
      .insert(trafficVisitors)
      .values({ day, visitor: key, audience: e.audience, device: e.device, os: e.os, standalone: e.standalone, restaurantId: e.restaurantId })
      .onConflictDoNothing()
      .catch((err) => log.warn("traffic.visitor.failed", { error: err instanceof Error ? err.message : String(err) }));
  }
}

function prune(now = Date.now()) {
  for (const [k, v] of state.live) if (now - v.at > LIVE_MS) state.live.delete(k);
}

export type LiveSnapshot = {
  total: number;
  byAudience: Record<Audience, number>;
  byDevice: Record<Device, number>;
  byOs: Record<string, number>;
  installed: number;
  byRestaurant: Map<string, { team: number; customers: number }>;
};

export function livePresence(): LiveSnapshot {
  prune();
  const byAudience = Object.fromEntries(AUDIENCES.map((a) => [a, 0])) as Record<Audience, number>;
  const byDevice = Object.fromEntries(DEVICES.map((d) => [d, 0])) as Record<Device, number>;
  const byOs: Record<string, number> = {};
  const byRestaurant = new Map<string, { team: number; customers: number }>();
  let installed = 0;
  for (const e of state.live.values()) {
    byAudience[e.audience]++;
    byDevice[e.device]++;
    byOs[e.os] = (byOs[e.os] ?? 0) + 1;
    if (e.standalone) installed++;
    if (e.restaurantId) {
      const r = byRestaurant.get(e.restaurantId) ?? { team: 0, customers: 0 };
      if (e.audience === "customer") r.customers++;
      else if (e.audience !== "visitor") r.team++;
      byRestaurant.set(e.restaurantId, r);
    }
  }
  return { total: state.live.size, byAudience, byDevice, byOs, installed, byRestaurant };
}

/** Every minute: write how many were live, by audience × device (kept 120 days). */
export async function flushTrafficMinute(now = new Date()) {
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  prune(now.getTime());
  const counts = new Map<string, number>();
  for (const e of state.live.values()) counts.set(`${e.audience}|${e.device}`, (counts.get(`${e.audience}|${e.device}`) ?? 0) + 1);
  const rows = [...counts].map(([k, n]) => {
    const [audience, device] = k.split("|") as [string, string];
    return { minute, audience, device, n };
  });
  const db = getDb();
  if (rows.length) await db.insert(trafficMinutes).values(rows).onConflictDoUpdate({ target: [trafficMinutes.minute, trafficMinutes.audience, trafficMinutes.device], set: { n: sql`excluded.n` } });
  if (minute.getUTCMinutes() === 0) {
    // Once an hour: keep 120 days of minutes and 400 days of visitors.
    await db.delete(trafficMinutes).where(sql`${trafficMinutes.minute} < now() - interval '120 days'`);
    await db.delete(trafficVisitors).where(sql`${trafficVisitors.day} < (now() - interval '400 days')::date`);
  }
}

export function startTrafficClock() {
  if (state.timer) return;
  state.timer = setInterval(() => {
    flushTrafficMinute().catch((err) => log.warn("traffic.flush.failed", { error: err instanceof Error ? err.message : String(err) }));
  }, 60_000);
  state.timer.unref?.();
}

/** Tests only. */
export function resetPresence() {
  state.live.clear();
  state.seenToday.clear();
}

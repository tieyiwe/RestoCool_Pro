import "server-only";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { FREE_LAUNCH } from "@/config/plans";
import type { DB } from "@/db";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { log } from "@/lib/log";
import { setFlags } from "./flags";

/** Banner shown on every business's app (maintenance, news…), in the 3 languages. */
export const Announcement = z.object({
  active: z.boolean(),
  level: z.enum(["info", "warning"]),
  text: z.object({ fr: z.string().trim().max(280), en: z.string().trim().max(280).optional(), zh: z.string().trim().max(280).optional() }),
});
export type Announcement = z.infer<typeof Announcement>;

export type PlatformSettings = { freeLaunch: boolean; announcement: Announcement | null };
const KEYS = ["freeLaunch", "announcement"] as const;

let cache: { at: number; value: PlatformSettings } | null = null;
const TTL_MS = 15_000;

/**
 * Platform settings (cached 15 s per server process). Never fails a page: on a database problem
 * the code defaults apply.
 */
export async function getPlatformSettings(db: DB = getDb()): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: PlatformSettings = { freeLaunch: FREE_LAUNCH, announcement: null };
  try {
    const rows = await db.select().from(platformSettings).where(inArray(platformSettings.key, [...KEYS]));
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const fl = z.boolean().safeParse(get("freeLaunch"));
    const an = Announcement.safeParse(get("announcement"));
    value = { freeLaunch: fl.success ? fl.data : FREE_LAUNCH, announcement: an.success ? an.data : null };
  } catch (err) {
    log.warn("platform_settings_unavailable", { err });
  }
  cache = { at: Date.now(), value };
  setFlags({ freeLaunch: value.freeLaunch });
  return value;
}

export async function savePlatformSetting(db: DB, key: (typeof KEYS)[number], value: unknown, by: string) {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  cache = null;
  await getPlatformSettings(db);
}

export async function clearPlatformSetting(db: DB, key: (typeof KEYS)[number]) {
  await db.delete(platformSettings).where(eq(platformSettings.key, key));
  cache = null;
  await getPlatformSettings(db);
}

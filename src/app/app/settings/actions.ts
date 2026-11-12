"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { log } from "@/lib/log";
import { FEATURE_FLAGS } from "@/db/schema";
import * as settings from "@/lib/restaurants/settings";
import type { SettingsError } from "@/lib/restaurants/settings";

export type SettingsResult = { ok: boolean; error?: SettingsError | "unknown"; at: number } | null;

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function run(fn: (ctx: settings.SettingsCtx) => Promise<void>): Promise<SettingsResult> {
  try {
    const { actor, repo } = await requireMember("settings.write");
    await fn({ db: getDb(), actor, repo });
  } catch (err) {
    if (err instanceof settings.SettingsValidationError) return { ok: false, error: err.code, at: Date.now() };
    log.error("settings_save_failed", { err });
    return { ok: false, error: "unknown", at: Date.now() };
  }
  revalidatePath("/app", "layout");
  return { ok: true, at: Date.now() };
}

export async function saveProfileAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) =>
    settings.saveProfile(ctx, {
      name: s(fd, "name"),
      slug: s(fd, "slug"),
      description: { fr: s(fd, "description_fr"), en: s(fd, "description_en"), zh: s(fd, "description_zh") },
      city: s(fd, "city"),
      address: s(fd, "address"),
      ...(fd.has("gmapsUrl") ? { gmapsUrl: s(fd, "gmapsUrl") } : {}),
    }),
  );
}

export async function saveContactsAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) =>
    settings.saveContacts(ctx, {
      phones: [s(fd, "phone1"), s(fd, "phone2"), s(fd, "phone3")],
      whatsapp: s(fd, "whatsapp"),
      orangeMoney: s(fd, "orangeMoney"),
      moovMoney: s(fd, "moovMoney"),
    }),
  );
}

export async function saveHoursAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) =>
    settings.saveHours(
      ctx,
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        open: fd.get(`open_${weekday}`) === "on",
        opens: s(fd, `opens_${weekday}`) || "10:00",
        closes: s(fd, `closes_${weekday}`) || "22:00",
      })),
    ),
  );
}

export async function saveServiceAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) =>
    settings.saveService(ctx, {
      seatingModes: fd.getAll("seatingModes").map(String) as never,
      qrStrategy: s(fd, "qrStrategy") as never,
      orderValidation: s(fd, "orderValidation") as never,
      enabledLocales: fd.getAll("enabledLocales").map(String) as never,
      inactivity:
        fd.get("warnAfterMin") !== null
          ? { warnAfterSec: Math.round(Number(s(fd, "warnAfterMin")) * 60), releaseAfterSec: Math.round(Number(s(fd, "releaseAfterSec"))) }
          : undefined,
      serviceDelays:
        fd.get("warnMin") !== null ? { warnMin: Math.round(Number(s(fd, "warnMin"))), lateMin: Math.round(Number(s(fd, "lateMin"))) } : undefined,
      tableCount: fd.get("tableCount") !== null && s(fd, "tableCount") !== "" ? Math.round(Number(s(fd, "tableCount"))) : undefined,
    }),
  );
}

export async function saveAppearanceAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) =>
    settings.saveAppearance(ctx, {
      theme: s(fd, "theme") as never,
      accentColor: s(fd, "accentColor"),
      accent2: s(fd, "accent2"),
      logoUrl: s(fd, "logoUrl"),
      coverUrl: s(fd, "coverUrl"),
    }),
  );
}

export async function saveFeaturesAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) =>
    settings.saveFeatures(ctx, {
      features: Object.fromEntries(FEATURE_FLAGS.map((f) => [f, fd.get(f) === "on"])) as Record<(typeof FEATURE_FLAGS)[number], boolean>,
      poweredBadge: fd.get("poweredBadge") === "on",
    }),
  );
}

export async function setPublishedAction(_p: SettingsResult, fd: FormData) {
  return run((ctx) => settings.setPublished(ctx, fd.get("published") === "1"));
}

export async function finishOnboardingAction() {
  return run((ctx) => settings.markOnboarded(ctx));
}

/* ---------- Business location (GPS on site, or a Google Maps link) ---------- */

export type LocationResult = { ok: true; lat: number; lng: number } | { ok: false; error: "invalid" | "no_coordinates" | "too_imprecise" | "unknown" } | null;

async function runLocation(fn: (ctx: settings.SettingsCtx) => Promise<void>): Promise<LocationResult> {
  const { LocationError } = await import("@/lib/restaurants/location");
  try {
    const { actor, repo } = await requireMember("settings.write");
    await fn({ db: getDb(), actor, repo });
    const r = await repo.restaurant.get();
    revalidatePath("/app", "layout");
    return r?.latitude != null && r.longitude != null ? { ok: true, lat: r.latitude, lng: r.longitude } : { ok: false, error: "unknown" };
  } catch (err) {
    if (err instanceof LocationError) return { ok: false, error: err.code };
    log.error("location_save_failed", { err });
    return { ok: false, error: "unknown" };
  }
}

export async function saveGpsLocationAction(input: { lat: number; lng: number; accuracyM?: number }) {
  const { saveGpsLocation } = await import("@/lib/restaurants/location");
  return runLocation((ctx) => saveGpsLocation(ctx, input));
}

export async function saveLinkLocationAction(link: string) {
  const { saveLinkLocation } = await import("@/lib/restaurants/location");
  return runLocation((ctx) => saveLinkLocation(ctx, String(link ?? "")));
}

export async function clearLocationAction() {
  const { clearLocation } = await import("@/lib/restaurants/location");
  const { actor, repo } = await requireMember("settings.write");
  await clearLocation({ db: getDb(), actor, repo });
  revalidatePath("/app", "layout");
  return { ok: true as const };
}

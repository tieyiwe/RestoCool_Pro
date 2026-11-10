"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { kioskRestaurant, Pin, punch } from "@/lib/personnel/attendance";
import { rateLimit } from "@/lib/rate-limit";

export type KioskState =
  | undefined
  | { ok: true; action: "in" | "out"; name: string; time: string; minutes: number | null }
  | { ok: false; error: "invalid" | "restaurant" | "disabled" | "unknown" | "no_pin" | "wrong_pin" | "locked" | "too_many"; minutesLeft?: number; triesLeft?: number };

const Input = z.object({ staffNo: z.coerce.number().int().min(1).max(9999), pin: Pin });

/** Check-in kiosk: matricule + PIN. The restaurant comes from the QR token or its numéro RC. */
export async function punchAction(_prev: KioskState, fd: FormData): Promise<KioskState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  if (!rateLimit(`punch:${ip}`, { capacity: 20, refillPerSec: 1 / 6 })) return { ok: false, error: "too_many" };
  const p = Input.safeParse({ staffNo: String(fd.get("staffNo") ?? "").replace(/\D/g, ""), pin: String(fd.get("pin") ?? "") });
  if (!p.success) return { ok: false, error: "invalid" };
  const token = String(fd.get("token") ?? "");
  const rc = String(fd.get("rc") ?? "");
  const db = getDb();
  const r = await kioskRestaurant(db, token ? { token } : { rc });
  if (!r) return { ok: false, error: "restaurant" };
  const method = token ? "qr" : "code";
  const res = await punch(db, r, p.data.staffNo, p.data.pin, method);
  if (!res.ok) return { ok: false, error: res.error, minutesLeft: res.minutesLeft, triesLeft: res.triesLeft };
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Ouagadougou" }).format(res.at);
  return { ok: true, action: res.action, name: res.name, time, minutes: res.minutes };
}

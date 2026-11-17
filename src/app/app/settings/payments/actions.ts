"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { paymentProviderConfigs, restaurants } from "@/db/schema";
import { PROVIDER_IDS } from "@/db/schema/payments";
import { writeAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { encryptionReady, encryptJson } from "@/payments/crypto";
import { CREDENTIAL_FIELDS, providerById } from "@/payments/registry";
import { ProviderNotConfiguredError } from "@/payments/types";

const back = (q: string) => redirect(`/app/settings/payments?${q}`);

/**
 * Saves a provider's set-up. Credentials are write-only: an empty field keeps what was saved;
 * values are encrypted (AES-256-GCM) before they reach the database and never come back.
 */
export async function saveProviderAction(fd: FormData) {
  const m = await requireMember("settings.write");
  const provider = z.enum(PROVIDER_IDS).exclude(["manual"]).parse(fd.get("provider"));
  const p = providerById(provider);
  if (!p?.implemented) back("error=not_available");
  const enabled = fd.get("enabled") === "on";
  const mode = fd.get("mode") === "live" ? "live" : "test";
  const typed: Record<string, string> = {};
  for (const f of CREDENTIAL_FIELDS[provider]) {
    const v = String(fd.get(`cred_${f}`) ?? "").trim();
    if (v) typed[f] = v.slice(0, 500);
  }
  if (Object.keys(typed).length && !encryptionReady()) back("error=no_key");
  const db = getDb();
  const rid = m.repo.restaurantId;
  const [existing] = await db.select().from(paymentProviderConfigs).where(and(eq(paymentProviderConfigs.restaurantId, rid), eq(paymentProviderConfigs.provider, provider)));
  // Partial update: fields left empty keep their saved value (we cannot read them back to merge, so all must be typed again to change any).
  const sealed = Object.keys(typed).length ? encryptJson(typed) : (existing?.credentialsEncrypted ?? null);
  if (enabled && !sealed) back("error=credentials_missing");
  if (existing) {
    await db.update(paymentProviderConfigs).set({ enabled, mode, credentialsEncrypted: sealed, updatedAt: new Date() }).where(eq(paymentProviderConfigs.id, existing.id));
  } else {
    await db.insert(paymentProviderConfigs).values({ restaurantId: rid, provider, enabled, mode, credentialsEncrypted: sealed });
  }
  // Never the credentials in the log: only that they changed.
  await writeAudit(db, m.actor, { restaurantId: rid, action: "payments.provider.saved", entity: "payment_provider", entityId: provider, data: { enabled, mode, credentialsChanged: Object.keys(typed).length > 0 } });
  revalidatePath("/app/settings/payments");
  back("ok=saved");
}

/** « Tester la connexion »: asks the provider for an unknown payment (a real adapter answers). */
export async function testProviderAction(fd: FormData) {
  await requireMember("settings.write");
  const p = providerById(String(fd.get("provider") ?? ""));
  if (!p || p.id === "manual") throw new NotFoundError();
  try {
    await p.getStatus("restocool-connection-test");
    back("ok=tested");
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) back("error=not_available");
    throw err;
  }
}

/** Cash register rules: the discount share above which a manager or the owner must approve. */
export async function cashierSettingsAction(fd: FormData) {
  const m = await requireMember("settings.write");
  const pct = z.coerce.number().int().min(0).max(100).parse(fd.get("discountApprovalPercent"));
  const r = await m.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  const settings = { ...r.settings, payments: { ...((r.settings as { payments?: object }).payments ?? {}), discountApprovalPercent: pct } };
  await getDb().update(restaurants).set({ settings, updatedAt: new Date() }).where(eq(restaurants.id, r.id));
  await writeAudit(getDb(), m.actor, { restaurantId: r.id, action: "payments.cashier.settings", entity: "restaurant", entityId: r.id, data: { discountApprovalPercent: pct } });
  revalidatePath("/app/settings/payments");
  back("ok=cashier");
}

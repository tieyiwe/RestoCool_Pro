import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { paymentProviderConfigs } from "@/db/schema";
import type { PaymentMethod, ProviderId } from "@/db/schema/payments";
import { decryptJson } from "./crypto";
import { cinetpayProvider } from "./providers/cinetpay";
import { ligdicashProvider } from "./providers/ligdicash";
import { manualProvider } from "./providers/manual";
import { moovmoneyProvider } from "./providers/moov_money";
import { orangemoneyProvider } from "./providers/orange_money";
import { paydunyaProvider } from "./providers/paydunya";
import type { PaymentProvider } from "./types";

export const PROVIDERS: Record<ProviderId, PaymentProvider> = {
  manual: manualProvider,
  cinetpay: cinetpayProvider,
  paydunya: paydunyaProvider,
  ligdicash: ligdicashProvider,
  orange_money: orangemoneyProvider,
  moov_money: moovmoneyProvider,
};

/** The online providers a business can set up (everything but « manual »). */
export const ONLINE_PROVIDERS = (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => p !== "manual");

/** Credential fields each provider asks for (names only; values are write-only). */
export const CREDENTIAL_FIELDS: Record<Exclude<ProviderId, "manual">, string[]> = {
  cinetpay: ["apiKey", "siteId", "secretKey"],
  paydunya: ["masterKey", "privateKey", "token"],
  ligdicash: ["apiKey", "token"],
  orange_money: ["clientId", "clientSecret", "merchantKey"],
  moov_money: ["username", "password", "merchantId"],
};

export const providerById = (id: string): PaymentProvider | null => (id in PROVIDERS ? PROVIDERS[id as ProviderId] : null);

export type ResolvedProvider = { provider: PaymentProvider; credentials: Record<string, string> | null; mode: "test" | "live" };

/**
 * The online provider a business uses for a method: an enabled, implemented adapter with saved
 * credentials. Null when there is none (the « Payer maintenant » button stays hidden).
 */
export async function onlineProviderFor(db: DB, restaurantId: string, method: PaymentMethod): Promise<ResolvedProvider | null> {
  const configs = await db
    .select()
    .from(paymentProviderConfigs)
    .where(and(eq(paymentProviderConfigs.restaurantId, restaurantId), eq(paymentProviderConfigs.enabled, true)));
  for (const c of configs) {
    const p = PROVIDERS[c.provider];
    if (!p || !p.implemented || !p.supports.methods.includes(method) || !c.credentialsEncrypted) continue;
    return { provider: p, credentials: decryptJson(c.credentialsEncrypted), mode: c.mode };
  }
  return null;
}

/** Staff recording money by hand always use « manual ». */
export const manualFor = (): ResolvedProvider => ({ provider: manualProvider, credentials: null, mode: "live" });

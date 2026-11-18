import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { log } from "@/lib/log";
import { encryptionReady } from "@/payments/crypto";
import { ONLINE_PROVIDERS, PROVIDERS } from "@/payments/registry";

/**
 * Online payments seen from the console (super admin): which providers are written, which
 * businesses connected one (never the credentials, only whether some are saved), the payment
 * attempts and the provider notifications (webhooks). Platform-wide or one business.
 */
export type AdminPayments = {
  keyReady: boolean;
  providers: Array<{ id: string; implemented: boolean; methods: string[]; businesses: number; enabled: number; live: number }>;
  configs: Array<{ restaurantId: string; business: string; slug: string; provider: string; enabled: boolean; mode: string; hasCredentials: boolean; updatedAt: string }>;
  intents: { total: number; online: number; succeeded: number; pending: number; failed: number; expired: number; onlineAmount: number };
  recent: Array<{ id: string; restaurantId: string | null; business: string | null; provider: string; method: string; amount: number; status: string; createdBy: string | null; lastError: string | null; createdAt: string }>;
  webhooks: { total: number; invalid: number; failed: number; list: Array<{ provider: string; signatureValid: boolean; error: string | null; receivedAt: string; processedAt: string | null }> };
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function adminPayments(db: DB, restaurantId?: string, now = new Date()): Promise<AdminPayments> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const only = (col: string) => (restaurantId ? sql`and ${sql.raw(col)} = ${restaurantId}` : sql``);
  // A failing query (e.g. the payment tables not created yet) shows empty figures, never a broken page.
  const rows = async (q: ReturnType<typeof sql>) => {
    try {
      return (await db.execute<Record<string, unknown>>(q)).rows as Record<string, unknown>[];
    } catch (err) {
      log.error("admin_payments_failed", { error: err instanceof Error ? err.message : String(err) });
      return [] as Record<string, unknown>[];
    }
  };
  const [configs, intents, recent, hooks, hookList] = await Promise.all([
    rows(sql`select c.restaurant_id, r.name, r.slug, c.provider, c.enabled, c.mode, (c.credentials_encrypted is not null) as has_creds, c.updated_at
      from payment_provider_configs c join restaurants r on r.id = c.restaurant_id
      where r.deleted_at is null ${only("c.restaurant_id")} order by c.updated_at desc limit 300`),
    rows(sql`select count(*)::int as total,
        count(*) filter (where i.provider <> 'manual')::int as online,
        count(*) filter (where i.provider <> 'manual' and i.status = 'succeeded')::int as succeeded,
        count(*) filter (where i.status in ('created', 'pending'))::int as pending,
        count(*) filter (where i.status = 'failed')::int as failed,
        count(*) filter (where i.status = 'expired')::int as expired,
        coalesce(sum(i.amount) filter (where i.provider <> 'manual' and i.status = 'succeeded'), 0)::bigint as online_amount
      from payment_intents i where i.created_at >= ${since} ${only("i.restaurant_id")}`),
    rows(sql`select i.id, i.restaurant_id, r.name, i.provider, i.method, i.amount, i.status, i.created_by, i.last_error, i.created_at
      from payment_intents i left join restaurants r on r.id = i.restaurant_id
      where (i.provider <> 'manual' or i.status <> 'succeeded') ${only("i.restaurant_id")}
      order by i.created_at desc limit 50`),
    restaurantId
      ? Promise.resolve([] as Record<string, unknown>[])
      : rows(sql`select count(*)::int as total, count(*) filter (where not w.signature_valid)::int as invalid, count(*) filter (where w.error is not null)::int as failed
          from payment_webhook_events w where w.received_at >= ${since}`),
    restaurantId
      ? Promise.resolve([] as Record<string, unknown>[])
      : rows(sql`select w.provider, w.signature_valid, w.error, w.received_at, w.processed_at from payment_webhook_events w order by w.received_at desc limit 30`),
  ]);
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
  const cfg = configs.map((c) => ({
    restaurantId: String(c.restaurant_id),
    business: String(c.name),
    slug: String(c.slug),
    provider: String(c.provider),
    enabled: Boolean(c.enabled),
    mode: String(c.mode),
    hasCredentials: Boolean(c.has_creds),
    updatedAt: iso(c.updated_at),
  }));
  const i = intents[0] ?? {};
  const h = hooks[0] ?? {};
  return {
    keyReady: encryptionReady(),
    providers: ONLINE_PROVIDERS.map((id) => {
      const mine = cfg.filter((c) => c.provider === id);
      return {
        id,
        implemented: PROVIDERS[id].implemented,
        methods: [...PROVIDERS[id].supports.methods],
        businesses: mine.length,
        enabled: mine.filter((c) => c.enabled && c.hasCredentials).length,
        live: mine.filter((c) => c.enabled && c.mode === "live").length,
      };
    }),
    configs: cfg,
    intents: { total: n(i.total), online: n(i.online), succeeded: n(i.succeeded), pending: n(i.pending), failed: n(i.failed), expired: n(i.expired), onlineAmount: n(i.online_amount) },
    recent: recent.map((x) => ({
      id: String(x.id),
      restaurantId: x.restaurant_id ? String(x.restaurant_id) : null,
      business: x.name ? String(x.name) : null,
      provider: String(x.provider),
      method: String(x.method),
      amount: n(x.amount),
      status: String(x.status),
      createdBy: x.created_by ? String(x.created_by).split(":")[0]! : null,
      lastError: x.last_error ? String(x.last_error).slice(0, 200) : null,
      createdAt: iso(x.created_at),
    })),
    webhooks: {
      total: n(h.total),
      invalid: n(h.invalid),
      failed: n(h.failed),
      list: hookList.map((w) => ({ provider: String(w.provider), signatureValid: Boolean(w.signature_valid), error: w.error ? String(w.error).slice(0, 200) : null, receivedAt: iso(w.received_at), processedAt: w.processed_at ? iso(w.processed_at) : null })),
    },
  };
}

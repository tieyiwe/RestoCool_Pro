import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { AdminPayments } from "@/lib/admin/payments";
import { formatFCFA } from "@/lib/format";

type T = (key: string, vars?: Record<string, string | number>) => string;
const STATUS: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-900",
  pending: "bg-amber-100 text-amber-900",
  created: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-900",
  expired: "bg-muted",
  cancelled: "bg-muted",
  refunded: "bg-sky-100 text-sky-900",
};
const F = (n: number) => formatFCFA(n) ?? "0 F";

/** Online payment status: providers, connected businesses, attempts, notifications. */
export function PaymentsCard({ p, t, perBusiness = false, when }: { p: AdminPayments; t: T; perBusiness?: boolean; when: (iso: string) => string }) {
  const kpis: Array<[string, string | number]> = [
    ["online", p.intents.online],
    ["succeeded", p.intents.succeeded],
    ["amount", F(p.intents.onlineAmount)],
    ["pending", p.intents.pending],
    ["failed", p.intents.failed + p.intents.expired],
    ...(perBusiness ? [] : ([["webhooks", p.webhooks.total], ["invalid", p.webhooks.invalid]] as Array<[string, number]>)),
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="admin-payments-card">
      {!perBusiness && (
        <Card className={p.keyReady ? "border-emerald-300" : "border-amber-300 bg-amber-50 text-amber-950"} data-testid="admin-payments-key">
          <p className="font-bold">{p.keyReady ? `✅ ${t("payments.keyOk")}` : `⚠️ ${t("payments.keyMissing")}`}</p>
          <p className="text-sm">{t("payments.keyHint")}</p>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([k, v]) => (
          <Card key={k}>
            <p className="text-sm text-muted-foreground">{t(`payments.kpi.${k}`)}</p>
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h3 className="mb-2 font-bold">{t("payments.providers")}</h3>
        <ul className="divide-y divide-border text-sm">
          {p.providers.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="admin-provider" data-provider={x.id}>
              <span className="font-semibold">
                {t(`payments.names.${x.id}`)} <span className="text-xs text-muted-foreground">({x.methods.join(", ")})</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-bold ${x.implemented ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{x.implemented ? t("payments.ready") : t("payments.stub")}</span>
                {perBusiness ? (
                  <span>{x.businesses ? (x.enabled ? t("payments.on") : t("payments.saved")) : t("payments.notSet")}</span>
                ) : (
                  <span>{t("payments.counts", { saved: x.businesses, on: x.enabled, live: x.live })}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {!perBusiness && (
        <Card>
          <h3 className="mb-2 font-bold">{t("payments.configs")}</h3>
          {p.configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("payments.noConfigs")}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {p.configs.map((c) => (
                <li key={`${c.restaurantId}:${c.provider}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin_pro/businesses/${c.restaurantId}`} className="font-semibold hover:underline">
                    {c.business}
                  </Link>
                  <span className="text-xs">
                    {t(`payments.names.${c.provider}`)} · {c.mode === "live" ? t("payments.live") : t("payments.test")} · {c.enabled ? t("payments.on") : t("payments.off")} · {c.hasCredentials ? t("payments.credsSaved") : t("payments.credsMissing")} · {when(c.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("payments.neverShown")}</p>
        </Card>
      )}
      <Card>
        <h3 className="mb-2 font-bold">{t("payments.recent")}</h3>
        {p.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("payments.noRecent")}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {p.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="admin-intent">
                <span>
                  {!perBusiness && r.restaurantId && (
                    <Link href={`/admin_pro/businesses/${r.restaurantId}`} className="font-semibold hover:underline">
                      {r.business}
                    </Link>
                  )}{" "}
                  <span className="text-xs text-muted-foreground">
                    {t(`payments.names.${r.provider}`)} · {r.method} · {r.createdBy ?? "—"} · {when(r.createdAt)}
                  </span>
                  {r.lastError && <span className="block text-xs text-red-700">{r.lastError}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">{F(r.amount)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[r.status] ?? "bg-muted"}`}>{t(`payments.status.${r.status}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {!perBusiness && (
        <Card>
          <h3 className="mb-2 font-bold">{t("payments.webhooksTitle")}</h3>
          {p.webhooks.list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("payments.noWebhooks")}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {p.webhooks.list.map((w, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {t(`payments.names.${w.provider}`)} · {when(w.receivedAt)}
                    {w.error && <span className="block text-xs text-red-700">{w.error}</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${w.signatureValid ? (w.error ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900") : "bg-red-100 text-red-900"}`}>
                    {!w.signatureValid ? t("payments.badSignature") : w.error ? t("payments.hookFailed") : w.processedAt ? t("payments.processed") : t("payments.received")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

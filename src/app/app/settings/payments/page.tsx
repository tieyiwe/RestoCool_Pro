import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { paymentProviderConfigs } from "@/db/schema";
import { requireMemberPage } from "@/lib/auth/page";
import { DEFAULT_DISCOUNT_APPROVAL_PERCENT } from "@/lib/billing";
import { encryptionReady } from "@/payments/crypto";
import { CREDENTIAL_FIELDS, ONLINE_PROVIDERS, PROVIDERS } from "@/payments/registry";
import { cashierSettingsAction, saveProviderAction, testProviderAction } from "./actions";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("payments"))("title") };
}

/**
 * « Paiements en ligne »: the providers a business can connect (stubs show « Bientôt » until their
 * adapter exists), with write-only credentials; and the cash register rules.
 */
export default async function PaymentsSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("settings.write");
  const [t, tc, sp] = await Promise.all([getTranslations("payments"), getTranslations("cashier"), searchParams]);
  const r = await ctx.repo.restaurant.get();
  if (!r) return null;
  const configs = await getDb().select().from(paymentProviderConfigs).where(eq(paymentProviderConfigs.restaurantId, r.id));
  const pct = (r.settings as { payments?: { discountApprovalPercent?: number } }).payments?.discountApprovalPercent ?? DEFAULT_DISCOUNT_APPROVAL_PERCENT;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5" data-testid="payments-settings">
      <div>
        <Link href="/app/settings" className="text-sm font-semibold underline">
          ← {t("back")}
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold">💳 {t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-900">
          {t(`ok.${sp.ok === "tested" ? "tested" : sp.ok === "cashier" ? "cashier" : "saved"}`)}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">
          {t(`errors.${["no_key", "credentials_missing", "not_available"].includes(sp.error) ? sp.error : "not_available"}`)}
        </p>
      )}

      <Card className="flex flex-col gap-3" data-testid="cashier-settings">
        <h2 className="text-lg font-extrabold">💰 {t("cashierTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("cashierHint")}</p>
        <form action={cashierSettingsAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t("discountApproval")}
            <span className="flex items-center gap-2">
              <input type="number" name="discountApprovalPercent" min={0} max={100} defaultValue={pct} className="min-h-11 w-24 rounded-lg border border-border bg-surface px-2 text-base" />
              %
            </span>
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground">
            {t("save")}
          </button>
        </form>
        <p className="text-sm">
          <Link href="/app/cashier" className="font-semibold underline">
            {tc("title")}
          </Link>{" "}
          ·{" "}
          <Link href="/app/closing" className="font-semibold underline">
            {tc("closingTitle")}
          </Link>
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">🌐 {t("onlineTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("onlineHint")}</p>
        {!encryptionReady() && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{t("noKey")}</p>}
        <ul className="flex flex-col gap-3">
          {ONLINE_PROVIDERS.map((id) => {
            const p = PROVIDERS[id];
            const c = configs.find((x) => x.provider === id);
            return (
              <li key={id} className="rounded-2xl border border-border p-4" data-testid="provider-row" data-provider={id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{t(`providers.${id}`)}</p>
                  {p.implemented ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c?.enabled ? "bg-emerald-100 text-emerald-900" : "bg-muted"}`}>{c?.enabled ? t("enabled") : t("disabled")}</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950" data-testid="provider-soon">
                      {t("soon")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.supports.methods.map((m) => tc(`methods.${m}`)).join(" · ")}</p>
                {p.implemented && (
                  <form action={saveProviderAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="provider" value={id} />
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
                      <input type="checkbox" name="enabled" defaultChecked={c?.enabled ?? false} className="h-5 w-5" />
                      {t("enable")}
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      {t("mode")}
                      <select name="mode" defaultValue={c?.mode ?? "test"} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base">
                        <option value="test">{t("modeTest")}</option>
                        <option value="live">{t("modeLive")}</option>
                      </select>
                    </label>
                    {CREDENTIAL_FIELDS[id].map((f) => (
                      <label key={f} className="flex flex-col gap-1 text-sm font-semibold">
                        {f}
                        <input type="password" name={`cred_${f}`} autoComplete="off" placeholder={c?.credentialsEncrypted ? t("savedPlaceholder") : ""} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base" />
                      </label>
                    ))}
                    <p className="text-xs text-muted-foreground sm:col-span-2">{t("writeOnly")}</p>
                    <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground">
                      {t("save")}
                    </button>
                  </form>
                )}
                {p.implemented && c?.credentialsEncrypted && (
                  <form action={testProviderAction} className="mt-2">
                    <input type="hidden" name="provider" value={id} />
                    <button type="submit" className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold">
                      {t("test")}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

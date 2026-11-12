import Link from "next/link";
import { z } from "zod";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { CASE_MINUTES, CHECKS, MIN_MATCHES, linkedRequest, recoveryContext } from "@/lib/admin/recovery";
import { requireSuperadminPage } from "@/lib/auth/context";
import { requestRef } from "@/lib/support/requests";
import { findByRcAction, verifyAction } from "./actions";
import { CaseActions } from "./case-actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";

/**
 * Account recovery. 1) find the business by its numéro RC; 2) ask the caller questions and type
 * their answers (the records are never shown here); 3) with a verified check, unlock or reset.
 */
export default async function AdminRecovery({ searchParams }: { searchParams: Promise<{ business?: string; request?: string; case?: string; error?: string }> }) {
  const sa = await requireSuperadminPage("recovery");
  const sp = await searchParams;
  const { t, format } = await adminI18n();
  const businessId = z.uuid().safeParse(sp.business).data;
  const db = getDb();
  const ctx = businessId ? await recoveryContext(db, businessId) : null;
  const request = sp.request && z.uuid().safeParse(sp.request).success ? await linkedRequest(db, sp.request) : null;
  const current = ctx?.cases.find((c) => c.id === sp.case) ?? null;
  const usable = current && current.verified && current.expiresAt > new Date() && current.by === sa.email;
  const labels: Record<string, string> = Object.fromEntries(
    ["newPin", "newPinHint", "ok_unlocked", "ok_reset", "ok_signin", "ok_owner", "err_expired", "err_invalid", "err_signinUnavailable", "inactive", "locked", "unlock", "resetPin", "setPin", "resetConfirm", "unlockSignIn", "ownerTitle", "ownerHint", "ownerSubmit", "ownerConfirm"].map((k) => [k, String(t.raw(`recovery.labels.${k}` as "recovery.labels.newPin"))]),
  );
  for (const r of ["owner", "manager", "server", "kitchen", "cashier"]) labels[`role_${r}`] = t(`roles.${r}` as "roles.owner");
  return (
    <div className="flex flex-col gap-5" data-testid="admin-recovery">
      <div>
        <h1 className="text-2xl font-extrabold">🔐 {t("recovery.title")}</h1>
        <p className="text-muted-foreground">{t("recovery.intro", { n: MIN_MATCHES, min: CASE_MINUTES })}</p>
      </div>
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {sp.error === "noMatch" ? t("recovery.noMatch") : t("errorInvalid")}
        </p>
      )}
      {request && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          {t("recovery.fromRequest")}{" "}
          <Link href={`/admin_pro/support/${request.id}`} className="font-semibold text-primary">
            {requestRef(request.number)} · {request.name} · {request.contact}
          </Link>
        </p>
      )}

      {!ctx ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>1. {t("recovery.step1")}</CardTitle>
          <form action={findByRcAction} className="flex flex-wrap gap-2">
            <input name="rc" required maxLength={20} placeholder="RC-K7M3P" aria-label={t("recovery.rc")} className="rc-code-input min-h-11 min-w-48 flex-1 rounded-lg px-3 text-lg font-bold tracking-widest" data-testid="recovery-rc" />
            <button className={`${btn} bg-primary text-primary-foreground`}>{t("recovery.find")}</button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("recovery.business")}</p>
              <p className="text-lg font-bold" data-testid="recovery-business">
                {ctx.r.name}
              </p>
            </div>
            <Link href="/admin_pro/recovery" className="text-sm font-semibold text-primary">
              {t("recovery.other")}
            </Link>
          </Card>

          {current && (
            <Card className={`flex flex-col gap-3 ${usable ? "border-emerald-400" : "border-red-300"}`} data-testid="recovery-result">
              <CardTitle>{current.verified ? `✅ ${t("recovery.verified")}` : `⛔ ${t("recovery.notVerified")}`}</CardTitle>
              <ul className="grid gap-1 text-sm sm:grid-cols-3">
                {(["rc", ...CHECKS] as const).map((c) => (
                  <li key={c}>
                    {current.checks[c] ? "✅" : "❌"} {t(`recovery.checks.${c}`)}
                  </li>
                ))}
              </ul>
              {current.verified && !usable && <p className="text-sm text-red-800">{t("recovery.expired")}</p>}
              {!current.verified && <p className="text-sm text-red-800">{t("recovery.notVerifiedHint", { n: MIN_MATCHES })}</p>}
              {usable && (
                <>
                  <p className="text-sm text-muted-foreground">{t("recovery.until", { time: format.dateTime(current.expiresAt, { timeStyle: "short" }) })}</p>
                  <CaseActions
                    caseId={current.id}
                    labels={labels}
                    team={ctx.team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, staffNo: m.staffNo, active: m.active, hasPin: m.hasPin, locked: Boolean(m.lockedUntil && m.lockedUntil > new Date()), signIn: Boolean(m.clerkUserId) }))}
                  />
                </>
              )}
            </Card>
          )}

          {!usable && (
            <Card className="flex flex-col gap-3">
              <CardTitle>2. {t("recovery.step2")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("recovery.step2Hint")}</p>
              <form action={verifyAction} className="grid gap-3 md:grid-cols-2" data-testid="recovery-verify-form">
                <input type="hidden" name="business" value={ctx.r.id} />
                {request && <input type="hidden" name="request" value={request.id} />}
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("recovery.callerName")}</span>
                  <input name="callerName" required maxLength={80} defaultValue={request?.name ?? ""} className={field} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("recovery.callerPhone")}</span>
                  <input name="callerPhone" maxLength={30} defaultValue={request?.contact ?? ""} className={field} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("recovery.rc")} *</span>
                  <input name="rc" required maxLength={20} placeholder="RC-…" autoComplete="off" className="rc-code-input min-h-11 w-full rounded-lg px-3 font-bold tracking-widest" data-testid="verify-rc" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("recovery.q.name")}</span>
                  <input name="businessName" maxLength={120} autoComplete="off" className={field} data-testid="verify-name" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("recovery.q.city")}</span>
                  <input name="city" maxLength={80} autoComplete="off" className={field} data-testid="verify-city" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">{t("recovery.q.phone")}</span>
                  <input name="phone" maxLength={30} autoComplete="off" className={field} data-testid="verify-phone" />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-semibold">{t("recovery.q.owner")}</span>
                  <input name="owner" maxLength={200} autoComplete="off" className={field} data-testid="verify-owner" />
                </label>
                <label className="flex min-h-11 items-start gap-2 text-sm md:col-span-2">
                  <input type="checkbox" name="callback" className="mt-1 size-5" data-testid="verify-callback" />
                  <span>{t("recovery.q.callback")}</span>
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block font-semibold">{t("recovery.note")}</span>
                  <input name="note" maxLength={500} className={field} />
                </label>
                <button className={`${btn} bg-primary text-primary-foreground md:col-span-2`} data-testid="verify-submit">
                  {t("recovery.check")}
                </button>
              </form>
            </Card>
          )}

          <Card>
            <CardTitle className="mb-2">{t("recovery.history")}</CardTitle>
            {ctx.cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {ctx.cases.map((c) => (
                  <li key={c.id} className="py-2">
                    <span className="font-semibold">{c.verified ? "✅" : "⛔"} {c.callerName}</span> · {c.score}/{CHECKS.length} · {c.by} · {format.dateTime(c.createdAt, { dateStyle: "short", timeStyle: "short" })}
                    {c.actions.length > 0 && <span className="block text-xs text-muted-foreground">{c.actions.map((a) => t(`recovery.actions.${a.action}` as "recovery.actions.pin_reset")).join(", ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

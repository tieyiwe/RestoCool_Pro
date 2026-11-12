import Link from "next/link";
import { adminI18n } from "@/lib/admin/i18n";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { pickText } from "@/i18n/config";
import { businessDetail } from "@/lib/admin/businesses";
import { requireSuperadminPage } from "@/lib/auth/context";
import { formatBfPhone, formatFCFA, telHref, whatsappHref } from "@/lib/format";
import { changePlanAction, featuredAction, noteAction, publishAction, recordPaymentAction, suspendAction } from "../../actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";
const OK = ["plan", "payment", "suspended", "reactivated", "published", "unpublished", "featured", "note"];

/** One business, for TIBLOGICS: contact, figures, plan & payments, controls, read-only view, notes, activity. */
export default async function AdminBusiness({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadminPage();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const d = await businessDetail(getDb(), id.data);
  if (!d) notFound();
  const sp = await searchParams;
  const [t, tp, format, locale] = await Promise.all([adminI18n().then((x) => x.t), adminI18n().then((x) => x.tp), adminI18n().then((x) => x.format), adminI18n().then((x) => x.locale)]);
  const { r } = d;
  const F = (n: number | null) => formatFCFA(n ?? 0) ?? "0 F";
  const owner = d.team.find((m) => m.role === "owner");
  const contact = r.whatsapp ?? r.phones[0] ?? null;
  const date = (x: Date | null) => (x ? format.dateTime(x, { dateStyle: "medium" }) : "—");
  return (
    <div className="flex flex-col gap-5" data-testid="admin-business">
      <Link href="/admin_pro/businesses" className="text-sm font-semibold text-primary">
        ← {t("businesses.title")}
      </Link>
      {sp.ok && OK.includes(sp.ok) && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.plan")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {t("errorInvalid")}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">
            {r.kind === "transport" ? "🚌 " : ""}
            {r.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {r.city ?? "—"} · <span className="font-mono">/r/{r.slug}</span>
            {d.rc && <span className="font-mono"> · RC-{d.rc}</span>} · {t("createdOn", { date: date(r.createdAt) })}
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold" data-testid="admin-plan-chip">
              {tp(r.plan)} · {tp(d.status)}
            </span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${r.published ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{r.published ? t("published") : t("draft")}</span>
            {r.featuredRank && <span className="rounded-full bg-or/30 px-2 py-0.5 font-semibold">★ {t("featuredRank", { n: r.featuredRank })}</span>}
            {r.settings.suspendedReason && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-900">{r.settings.suspendedReason}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/r/${r.slug}${r.published ? "" : "?preview=1"}`} target="_blank" rel="noopener" className={`${btn} border border-border bg-surface`}>
            👀 {t("viewPage")}
          </a>
          {contact && (
            <a href={whatsappHref(contact, t("waHello", { name: r.name })) ?? "#"} target="_blank" rel="noopener" className={`${btn} bg-[#25D366] text-black`}>
              💬 WhatsApp
            </a>
          )}
          {contact && (
            <a href={telHref(contact)} className={`${btn} border border-border bg-surface`}>
              📞 {formatBfPhone(contact)}
            </a>
          )}
          {owner?.email && (
            <a href={`mailto:${owner.email}`} className={`${btn} border border-border bg-surface`}>
              ✉️ {t("email")}
            </a>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("detail.orders30"), String(d.stats.orders30)],
          [t("detail.gmv30"), F(d.stats.gmv30)],
          [t("detail.ordersAll"), String(d.stats.orders)],
          [t("detail.items"), `${d.itemCount} · ${t("detail.team", { n: d.team.length })}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-muted-foreground">{k}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      <section id="plan" className="grid scroll-mt-20 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <CardTitle>💳 {t("detail.payment")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("detail.paymentHint", { until: date(r.planExpiresAt) })}</p>
          <form action={recordPaymentAction} className="grid gap-3 sm:grid-cols-2" data-testid="admin-payment-form">
            <input type="hidden" name="id" value={r.id} />
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.plan")}</span>
              <select name="plan" defaultValue={r.plan === "business" ? "business" : "pro"} className={field}>
                <option value="pro">{tp("pro")}</option>
                <option value="business">{tp("business")}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.months")}</span>
              <input name="months" type="number" min={1} max={24} defaultValue={1} required className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.amount")}</span>
              <input name="amount" inputMode="numeric" required placeholder="10000" className={field} data-testid="admin-amount" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.method")}</span>
              <select name="method" defaultValue="orange_money" className={field}>
                {(["orange_money", "moov_money", "cash", "bank", "other"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`methods.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold">{t("fields.reference")}</span>
              <input name="reference" maxLength={120} placeholder={t("fields.referencePlaceholder")} className={field} />
            </label>
            <button className={`${btn} bg-primary text-primary-foreground sm:col-span-2`} data-testid="admin-payment-submit">
              ✓ {t("detail.paymentSubmit")}
            </button>
          </form>
        </Card>

        <Card className="flex flex-col gap-3">
          <CardTitle>🛠️ {t("detail.planManual")}</CardTitle>
          <form action={changePlanAction} className="grid gap-3 sm:grid-cols-3" data-testid="admin-plan-form">
            <input type="hidden" name="id" value={r.id} />
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.plan")}</span>
              <select name="plan" defaultValue={r.plan} className={field}>
                {(["gratuit", "pro", "business"] as const).map((p) => (
                  <option key={p} value={p}>
                    {tp(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.status")}</span>
              <select name="status" defaultValue={r.planStatus} className={field}>
                {(["trial", "active", "past_due", "suspended"] as const).map((p) => (
                  <option key={p} value={p}>
                    {tp(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("fields.until")}</span>
              <input name="expiresOn" type="date" defaultValue={r.planExpiresAt ? r.planExpiresAt.toISOString().slice(0, 10) : ""} className={field} />
            </label>
            <label className="text-sm sm:col-span-3">
              <span className="mb-1 block font-semibold">{t("fields.reason")}</span>
              <input name="reason" maxLength={300} className={field} />
            </label>
            <button className={`${btn} border border-border bg-surface sm:col-span-3`}>{t("detail.planSave")}</button>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <form action={publishAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="on" value={r.published ? "0" : "1"} />
              <button className={`${btn} border border-border bg-surface`} data-testid="admin-publish">
                {r.published ? t("detail.unpublish") : t("detail.publish")}
              </button>
            </form>
            <form action={featuredAction} className="flex gap-2">
              <input type="hidden" name="id" value={r.id} />
              <select name="rank" defaultValue={r.featuredRank ? String(r.featuredRank) : ""} className={field + " w-auto"} aria-label={t("detail.featured")}>
                <option value="">{t("detail.notFeatured")}</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    ★ {t("featuredRank", { n })}
                  </option>
                ))}
              </select>
              <button className={`${btn} border border-border bg-surface`} data-testid="admin-featured">
                {t("detail.featuredSave")}
              </button>
            </form>
          </div>
          <form action={suspendAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3" data-testid="admin-suspend-form">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="on" value={r.planStatus === "suspended" ? "0" : "1"} />
            {r.planStatus !== "suspended" && (
              <label className="min-w-48 flex-1 text-sm">
                <span className="mb-1 block font-semibold">{t("fields.suspendReason")}</span>
                <input name="reason" maxLength={300} className={field} />
              </label>
            )}
            <ConfirmButton message={r.planStatus === "suspended" ? t("detail.reactivateConfirm") : t("detail.suspendConfirm")} className={`${btn} ${r.planStatus === "suspended" ? "bg-primary text-primary-foreground" : "bg-red-700 text-white"}`} data-testid="admin-suspend">
              {r.planStatus === "suspended" ? t("detail.reactivate") : t("detail.suspend")}
            </ConfirmButton>
          </form>
          <p className="text-xs text-muted-foreground">{t("detail.suspendHint")}</p>
        </Card>
      </section>

      {/* Read-only view of the business: what the owner has set up and what happens there. */}
      <section className="grid gap-4 lg:grid-cols-3" data-testid="admin-readonly">
        <Card>
          <CardTitle className="mb-2">🍽️ {t("detail.menu")}</CardTitle>
          {d.menu.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.menuEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {d.menu.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">{pickText(c.name, locale)}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {c.items} · 📷 {c.photos}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-2">👥 {t("detail.teamTitle")}</CardTitle>
          <ul className="flex flex-col gap-1 text-sm" data-testid="admin-team">
            {d.team.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">{String(m.staffNo ?? 0).padStart(3, "0")}</span> {m.name ?? m.email ?? "—"}
                  {!m.active && <span className="text-muted-foreground"> · {t("inactive")}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{t(`roles.${m.role}`)}</span>
              </li>
            ))}
            {r.settings.ownerEmail && <li className="text-xs text-muted-foreground">{t("detail.waitingOwner", { email: r.settings.ownerEmail })}</li>}
          </ul>
        </Card>
        <Card>
          <CardTitle className="mb-2">🧾 {t("detail.recent")}</CardTitle>
          {d.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {d.recent.map((o) => (
                <li key={o.id} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{o.code ?? `n° ${o.number}`}</span>
                  <span className="shrink-0 text-xs">
                    {o.seatLabel ?? "—"} · {F(o.subtotal)} · {format.dateTime(o.sentAt, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">📜 {t("detail.history")}</CardTitle>
          {d.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm" data-testid="admin-events">
              {d.events.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">
                      {tp(e.toPlan)} · {tp(e.toStatus)}
                    </span>
                    <span className="text-xs text-muted-foreground">{format.dateTime(e.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.amount ? `${F(e.amount)} · ${e.method ? t(`methods.${e.method}` as "methods.cash") : ""}` : ""}
                    {e.reference ? ` · ${e.reference}` : ""}
                    {e.bySuperadmin ? ` · ${e.bySuperadmin}` : e.automatic ? ` · ${t("auto")}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card id="notes" className="scroll-mt-20">
          <CardTitle className="mb-2">🗒️ {t("detail.notes")}</CardTitle>
          <form action={noteAction} className="mb-3 flex flex-col gap-2">
            <input type="hidden" name="id" value={r.id} />
            <textarea name="body" required maxLength={2000} rows={2} placeholder={t("detail.notePlaceholder")} className={field + " py-2"} data-testid="admin-note" />
            <button className={`${btn} self-start border border-border bg-surface`} data-testid="admin-note-submit">
              {t("detail.noteAdd")}
            </button>
          </form>
          <ul className="flex flex-col divide-y divide-border text-sm" data-testid="admin-notes">
            {d.notes.map((n) => (
              <li key={n.id} className="py-2">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {n.by} · {format.dateTime(n.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card>
        <CardTitle className="mb-2">🧾 {t("detail.activity")}</CardTitle>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {d.audit.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span className="font-mono text-xs">{a.action}</span>
              <span className="text-xs text-muted-foreground">
                {a.actorType} · {format.dateTime(a.createdAt, { dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

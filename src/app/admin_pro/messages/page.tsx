import { eq } from "drizzle-orm";
import { z } from "zod";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { adminI18n } from "@/lib/admin/i18n";
import { requireSuperadminPage } from "@/lib/auth/context";
import { MESSAGE_KINDS, readStats, sentMessages } from "@/lib/platform/messages";
import { sendMessageAction, withdrawMessageAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";
const KIND_ICON: Record<string, string> = { feature: "✨", news: "📰", maintenance: "🛠️", billing: "💳", message: "✉️" };

/** Messages and in-app notifications to businesses: new features, news, maintenance, billing… */
export default async function AdminMessages({ searchParams }: { searchParams: Promise<{ business?: string; ok?: string; error?: string }> }) {
  await requireSuperadminPage("comms");
  const sp = await searchParams;
  const db = getDb();
  const { t, format } = await adminI18n();
  const businessId = z.uuid().safeParse(sp.business).data;
  const [target] = businessId ? await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).where(eq(restaurants.id, businessId)) : [];
  const list = await sentMessages(db);
  const reads = await readStats(db, list.map((m) => m.id));
  return (
    <div className="flex flex-col gap-6" data-testid="admin-messages">
      <div>
        <h1 className="text-2xl font-extrabold">{t("messages.title")}</h1>
        <p className="text-muted-foreground">{t("messages.intro")}</p>
      </div>
      {sp.ok && ["messageSent", "messageWithdrawn"].includes(sp.ok) && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.messageSent")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {t("messages.error")}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <CardTitle>{target ? t("messages.toOne", { name: target.name }) : t("messages.new")}</CardTitle>
        <form action={sendMessageAction} className="grid gap-4 md:grid-cols-2" data-testid="admin-message-form">
          {target && <input type="hidden" name="restaurantIds" value={target.id} />}
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("messages.kind")}</span>
            <select name="kind" defaultValue={target ? "message" : "feature"} className={field}>
              {MESSAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_ICON[k]} {t(`messages.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("messages.to")}</span>
            <select name="to" defaultValue="owners" className={field}>
              {(["owners", "managers", "everyone"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`messages.toOptions.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block font-semibold">{t("messages.titleFr")} *</span>
            <input name="titleFr" required maxLength={140} className={field} data-testid="message-title" />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block font-semibold">{t("messages.bodyFr")} *</span>
            <textarea name="bodyFr" required maxLength={3000} rows={4} className={`${field} py-2`} data-testid="message-body" />
          </label>
          <details className="md:col-span-2">
            <summary className="cursor-pointer text-sm font-semibold">{t("messages.translations")}</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input name="titleEn" maxLength={140} placeholder={t("messages.titleEn")} aria-label={t("messages.titleEn")} className={field} />
              <input name="titleZh" maxLength={140} placeholder={t("messages.titleZh")} aria-label={t("messages.titleZh")} className={field} />
              <textarea name="bodyEn" maxLength={3000} rows={3} placeholder={t("messages.bodyEn")} aria-label={t("messages.bodyEn")} className={`${field} py-2`} />
              <textarea name="bodyZh" maxLength={3000} rows={3} placeholder={t("messages.bodyZh")} aria-label={t("messages.bodyZh")} className={`${field} py-2`} />
            </div>
          </details>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("messages.link")}</span>
            <input name="link" maxLength={300} placeholder="/app/menu" className={field} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("messages.expires")}</span>
            <select name="expiresInDays" defaultValue="" className={field}>
              <option value="">{t("messages.never")}</option>
              {[1, 7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {t("messages.days", { n: d })}
                </option>
              ))}
            </select>
          </label>
          {!target && (
            <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-3 md:col-span-2">
              <legend className="px-1 text-sm font-semibold">{t("messages.targeting")}</legend>
              <p className="text-xs text-muted-foreground">{t("messages.targetingHint")}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {(["gratuit", "pro", "business"] as const).map((p) => (
                  <label key={p} className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" name="plans" value={p} className="size-5" /> {t(`messages.plans.${p}`)}
                  </label>
                ))}
                {(["restaurant", "transport"] as const).map((k) => (
                  <label key={k} className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" name="kinds" value={k} className="size-5" /> {t(`messages.kindsBiz.${k}`)}
                  </label>
                ))}
              </div>
              <input name="cities" maxLength={500} placeholder={t("messages.cities")} aria-label={t("messages.cities")} className={field} />
              <input name="rcCodes" maxLength={2000} placeholder={t("messages.rcCodes")} aria-label={t("messages.rcCodes")} className={field} />
            </fieldset>
          )}
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" name="popup" className="mt-1 size-5" data-testid="message-popup" />
            <span>
              <b>{t("messages.popup")}</b>
              <span className="block text-xs text-muted-foreground">{t("messages.popupHint")}</span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" name="email" className="mt-1 size-5" />
            <span>
              <b>{t("messages.email")}</b>
              <span className="block text-xs text-muted-foreground">{t("messages.emailHint")}</span>
            </span>
          </label>
          <ConfirmButton message={t("messages.confirm")} className={`${btn} bg-primary text-primary-foreground md:col-span-2`} data-testid="message-send">
            📣 {t("messages.send")}
          </ConfirmButton>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("messages.sent")}</h2>
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        <ul className="flex flex-col gap-2" data-testid="admin-sent-messages">
          {list.map((m) => {
            const expired = m.expiresAt && m.expiresAt < new Date();
            const n = reads.get(m.id) ?? 0;
            return (
              <li key={m.id} className={`rounded-2xl border border-border bg-surface p-4 ${expired ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      {KIND_ICON[m.kind]} {m.title.fr}
                      {m.popup && <span className="ml-2 rounded bg-or/30 px-1.5 text-xs">{t("messages.popupTag")}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(m.createdAt, { dateStyle: "medium", timeStyle: "short" })} · {m.createdBy} · {t(`messages.toOptions.${m.audience.to}`)}
                      {m.audience.restaurantIds?.length ? ` · ${t("messages.nBusinesses", { n: m.audience.restaurantIds.length })}` : ""}
                      {m.audience.plans?.length ? ` · ${m.audience.plans.join(", ")}` : ""}
                      {m.audience.cities?.length ? ` · ${m.audience.cities.join(", ")}` : ""}
                    </p>
                  </div>
                  {!expired && (
                    <form action={withdrawMessageAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <ConfirmButton message={t("messages.withdrawConfirm")} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold">
                        {t("messages.withdraw")}
                      </ConfirmButton>
                    </form>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{m.body.fr}</p>
                <p className="mt-2 text-xs font-semibold" data-testid="message-reads">
                  {t("messages.reads", { read: n, total: m.recipients, pct: m.recipients ? Math.round((n / m.recipients) * 100) : 0 })}
                  {m.email ? ` · ${t("messages.emailed", { n: m.emailedCount })}` : ""}
                  {expired ? ` · ${t("messages.withdrawn")}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

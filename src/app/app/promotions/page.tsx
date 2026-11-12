import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PROMO_THEME_IDS, promoTheme } from "@/config/promo-themes";
import { getDb } from "@/db";
import { pickText } from "@/i18n/config";
import { requireMemberPage } from "@/lib/auth/page";
import { formatFCFA } from "@/lib/format";
import { hasFeature } from "@/lib/plan";
import { listBusinessPromos, MAX_BUSINESS_PROMOS, promoState, type Promotion } from "@/lib/promotions";
import { deletePromoAction, savePromoAction, togglePromoAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("promos"))("title") };
}

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-xl px-4 font-bold";
const STATE: Record<string, string> = { live: "bg-emerald-100 text-emerald-900", scheduled: "bg-sky-100 text-sky-900", paused: "bg-muted", ended: "bg-muted text-muted-foreground" };
const local = (d: Date | null) => (d ? new Date(d.getTime()).toISOString().slice(0, 16) : "");

/** Offers on the business page and on dishes (Business plan). */
export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("settings.write");
  const [t, format, locale, sp] = await Promise.all([getTranslations("promos"), getFormatter(), getLocale(), searchParams]);
  const r = await ctx.repo.restaurant.get();
  if (!r) return null;
  const allowed = hasFeature(r, "promotions");
  const db = getDb();
  const [list, items] = await Promise.all([allowed ? listBusinessPromos(db, r.id) : Promise.resolve([]), allowed ? ctx.repo.menu.items() : Promise.resolve([])]);
  const itemName = new Map(items.map((i) => [i.id, `${i.code ? `${i.code}. ` : ""}${pickText(i.name, locale)}`]));
  const itemPrice = new Map(items.map((i) => [i.id, i.price]));

  if (!allowed)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5" data-testid="promos-upsell">
        <h1 className="text-2xl font-extrabold">🔥 {t("title")}</h1>
        <Card className="flex flex-col gap-3 border-2 border-[var(--rc-or)]">
          <CardTitle>{t("upsellTitle")}</CardTitle>
          <p>{t("upsellText")}</p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>{t("upsell1")}</li>
            <li>{t("upsell2")}</li>
            <li>{t("upsell3")}</li>
          </ul>
          <a href="/app/support" className={`${btn} flex items-center justify-center bg-primary text-primary-foreground sm:self-start`}>
            {t("upsellCta")}
          </a>
        </Card>
      </div>
    );

  const form = (p?: Promotion) => (
    <form action={savePromoAction} className="grid gap-3 md:grid-cols-2" data-testid={p ? "promo-edit-form" : "promo-form"}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-semibold">{t("kind")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["item", "page"] as const).map((k) => (
            <label key={k} className="flex min-h-14 cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="placement" value={k} defaultChecked={(p?.placement ?? "item") === k} className="mt-0.5 size-5" data-testid={`promo-kind-${k}`} />
              <span>
                <span className="block font-bold">{t(`kinds.${k}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`kindsHint.${k}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block font-semibold">{t("item")}</span>
        <select name="itemId" defaultValue={p?.itemId ?? ""} className={field} data-testid="promo-item">
          <option value="">—</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {itemName.get(i.id)} {i.price !== null ? `· ${formatFCFA(i.price)}` : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">{t("itemHint")}</span>
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block font-semibold">{t("titleFr")} *</span>
        <input name="titleFr" required maxLength={90} defaultValue={p?.title.fr ?? ""} placeholder={t("titlePlaceholder")} className={field} data-testid="promo-title" />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block font-semibold">{t("bodyFr")}</span>
        <textarea name="bodyFr" maxLength={400} rows={3} defaultValue={p?.body?.fr ?? ""} placeholder={t("bodyPlaceholder")} className={`${field} py-2`} />
      </label>
      <details className="md:col-span-2">
        <summary className="cursor-pointer text-sm font-semibold">{t("translations")}</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input name="titleEn" maxLength={90} defaultValue={p?.title.en ?? ""} placeholder={t("titleEn")} aria-label={t("titleEn")} className={field} />
          <input name="titleZh" maxLength={90} defaultValue={p?.title.zh ?? ""} placeholder={t("titleZh")} aria-label={t("titleZh")} className={field} />
          <textarea name="bodyEn" maxLength={400} rows={2} defaultValue={p?.body?.en ?? ""} placeholder={t("bodyEn")} aria-label={t("bodyEn")} className={`${field} py-2`} />
          <textarea name="bodyZh" maxLength={400} rows={2} defaultValue={p?.body?.zh ?? ""} placeholder={t("bodyZh")} aria-label={t("bodyZh")} className={`${field} py-2`} />
        </div>
      </details>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("badge")}</span>
        <input name="badge" maxLength={24} defaultValue={p?.badge ?? ""} placeholder="-20 %" className={field} data-testid="promo-badge-input" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("promoPrice")}</span>
        <input name="promoPrice" inputMode="numeric" defaultValue={p?.promoPrice ?? ""} placeholder="2500" className={field} data-testid="promo-price" />
        <span className="mt-1 block text-xs text-muted-foreground">{t("promoPriceHint")}</span>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("startsAt")}</span>
        <input type="datetime-local" name="startsAt" defaultValue={local(p?.startsAt ?? null)} className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("endsAt")}</span>
        <input type="datetime-local" name="endsAt" defaultValue={local(p?.endsAt ?? null)} className={field} data-testid="promo-ends" />
      </label>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-semibold">{t("theme")}</legend>
        <div className="flex flex-wrap gap-2">
          {PROMO_THEME_IDS.map((id) => {
            const th = promoTheme(id);
            return (
              <label key={id} className="cursor-pointer">
                <input type="radio" name="theme" value={id} defaultChecked={(p?.theme ?? "gold") === id} className="peer sr-only" />
                <span className="flex min-h-11 items-center gap-1 rounded-full border-2 border-transparent px-4 text-sm font-bold peer-checked:border-foreground peer-focus-visible:ring-2" style={{ background: th.bg, color: th.fg }}>
                  {t(`themes.${id}`)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block font-semibold">{t("imageUrl")}</span>
        <input name="imageUrl" maxLength={300} defaultValue={p?.imageUrl ?? ""} placeholder="https://… ou /api/media/…" className={field} />
      </label>
      <button className={`${btn} bg-primary text-primary-foreground md:col-span-2`} data-testid={p ? "promo-update" : "promo-create"}>
        {p ? t("save") : t("create")}
      </button>
    </form>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6" data-testid="promos-page">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">🔥 {t("title")}</h1>
          <p className="text-muted-foreground">{t("intro", { n: MAX_BUSINESS_PROMOS })}</p>
        </div>
        <Link href={`/r/${r.slug}${r.published ? "" : "?preview=1"}`} target="_blank" className={`${btn} flex items-center border border-border bg-surface`}>
          👀 {t("seePage")}
        </Link>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900" data-testid="promo-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.created")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">
          {t(`errors.${sp.error}` as "errors.invalid")}
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="mine">
        <h2 id="mine" className="text-lg font-bold">
          {t("current", { n: list.length })}
        </h2>
        {list.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">{t("none")}</p>}
        {list.map((p) => {
          const th = promoTheme(p.theme);
          const st = promoState(p);
          return (
            <Card key={p.id} id={`p-${p.id}`} className="flex scroll-mt-24 flex-col gap-3" data-testid="promo-row">
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-full max-w-xs shrink-0 rounded-2xl p-4 shadow" style={{ background: th.bg, color: th.fg }}>
                  {p.badge && (
                    <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-extrabold" style={{ background: th.accent, color: th.bg }}>
                      {p.badge}
                    </span>
                  )}
                  <p className="text-lg leading-tight font-extrabold">{p.title.fr}</p>
                  {p.itemId && (
                    <p className="mt-1 text-sm font-semibold opacity-90">
                      {itemName.get(p.itemId) ?? "—"}
                      {p.promoPrice !== null && (
                        <>
                          {" · "}
                          {itemPrice.get(p.itemId) != null && <s className="opacity-70">{formatFCFA(itemPrice.get(p.itemId)!)}</s>} <b>{formatFCFA(p.promoPrice)}</b>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE[st]}`} data-testid="promo-state">
                      {t(`states.${st}`)}
                    </span>
                    <span className="text-muted-foreground">{t(`kinds.${p.placement as "item"}`)}</span>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {p.startsAt ? t("from", { date: format.dateTime(p.startsAt, { dateStyle: "medium", timeStyle: "short" }) }) : t("fromNow")} · {p.endsAt ? t("until", { date: format.dateTime(p.endsAt, { dateStyle: "medium", timeStyle: "short" }) }) : t("noEnd")}
                  </p>
                  <p className="mt-1 font-semibold" data-testid="promo-stats">
                    {t("stats", { views: p.views, clicks: p.clicks })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {st !== "ended" && (
                      <form action={togglePromoAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="on" value={p.active ? "0" : "1"} />
                        <button className={`${btn} border border-border bg-surface text-sm`} data-testid="promo-toggle">
                          {p.active ? `⏸ ${t("pause")}` : `▶ ${t("resume")}`}
                        </button>
                      </form>
                    )}
                    <form action={deletePromoAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton message={t("deleteConfirm")} className={`${btn} border border-border bg-surface text-sm text-red-700`}>
                        {t("delete")}
                      </ConfirmButton>
                    </form>
                  </div>
                </div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary" data-testid="promo-edit">
                  ✏️ {t("edit")}
                </summary>
                <div className="mt-3">{form(p)}</div>
              </details>
            </Card>
          );
        })}
      </section>

      <Card className="flex flex-col gap-3">
        <CardTitle>➕ {t("new")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("whereShown")}</p>
        {form()}
      </Card>
    </div>
  );
}

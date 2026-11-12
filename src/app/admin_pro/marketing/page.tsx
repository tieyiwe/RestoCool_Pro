import { asc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PROMO_THEME_IDS, promoTheme } from "@/config/promo-themes";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { adminI18n } from "@/lib/admin/i18n";
import { requireSuperadminPage } from "@/lib/auth/context";
import { PLATFORM_PLACEMENTS, listBusinessPromosAll, listPlatformPromos, promoState, type Promotion } from "@/lib/promotions";
import { deletePlatformPromoAction, featuredAction, savePlatformPromoAction, togglePlatformPromoAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";
const STATE: Record<string, string> = { live: "bg-emerald-100 text-emerald-900", scheduled: "bg-sky-100 text-sky-900", paused: "bg-muted", ended: "bg-muted text-muted-foreground" };
const local = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");
const ctr = (v: number, c: number) => (v ? `${((c / v) * 100).toFixed(1)} %` : "—");

/** Marketing: campaigns on the home page and on free-plan menus, featured businesses, businesses' own offers. */
export default async function AdminMarketing({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadminPage("marketing");
  const db = getDb();
  const [{ t, format }, sp, campaigns, offers, published, featured] = await Promise.all([
    adminI18n(),
    searchParams,
    listPlatformPromos(db),
    listBusinessPromosAll(db, 40),
    db.select({ id: restaurants.id, name: restaurants.name, city: restaurants.city, featuredRank: restaurants.featuredRank }).from(restaurants).where(eq(restaurants.published, true)).orderBy(asc(restaurants.name)),
    db.select({ id: restaurants.id, name: restaurants.name, rank: restaurants.featuredRank }).from(restaurants).where(isNotNull(restaurants.featuredRank)).orderBy(asc(restaurants.featuredRank)),
  ]);
  const live = campaigns.filter((c) => promoState(c) === "live");
  const views = campaigns.reduce((a, c) => a + c.views, 0);
  const clicks = campaigns.reduce((a, c) => a + c.clicks, 0);
  const place = (p: string) => t(`marketing.placements.${p}` as "marketing.placements.home_hero");

  const form = (p?: Promotion) => (
    <form action={savePlatformPromoAction} className="grid gap-3 md:grid-cols-2" data-testid={p ? "campaign-edit-form" : "campaign-form"}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-semibold">{t("marketing.placement")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PLATFORM_PLACEMENTS.map((k) => (
            <label key={k} className="flex min-h-16 cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="placement" value={k} defaultChecked={(p?.placement ?? "home_hero") === k} className="mt-0.5 size-5" data-testid={`campaign-placement-${k}`} />
              <span>
                <span className="block font-bold">{place(k)}</span>
                <span className="text-xs text-muted-foreground">{t(`marketing.placementHints.${k}` as "marketing.placementHints.home_hero")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.titleFr")} *</span>
        <input name="titleFr" required maxLength={90} defaultValue={p?.title.fr ?? ""} className={field} data-testid="campaign-title" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.titleEn")}</span>
        <input name="titleEn" maxLength={90} defaultValue={p?.title.en ?? ""} className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.bodyFr")}</span>
        <textarea name="bodyFr" maxLength={400} rows={2} defaultValue={p?.body?.fr ?? ""} className={`${field} py-2`} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.bodyEn")}</span>
        <textarea name="bodyEn" maxLength={400} rows={2} defaultValue={p?.body?.en ?? ""} className={`${field} py-2`} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.ctaFr")}</span>
        <input name="ctaFr" maxLength={30} defaultValue={p?.ctaLabel?.fr ?? ""} placeholder="Découvrir" className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.ctaEn")}</span>
        <input name="ctaEn" maxLength={30} defaultValue={p?.ctaLabel?.en ?? ""} placeholder="Discover" className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.promoteBusiness")}</span>
        <select name="restaurantId" defaultValue={p?.restaurantId ?? ""} className={field} data-testid="campaign-business">
          <option value="">{t("marketing.noBusiness")}</option>
          {published.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.city ? ` · ${r.city}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.link")}</span>
        <input name="link" maxLength={300} defaultValue={p?.link ?? ""} placeholder="/restaurants · /sign-up · https://…" className={field} />
        <span className="mt-1 block text-xs text-muted-foreground">{t("marketing.linkHint")}</span>
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.badge")}</span>
        <input name="badge" maxLength={24} defaultValue={p?.badge ?? ""} placeholder="Nouveau" className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.priority")}</span>
        <input name="priority" type="number" min={0} max={100} defaultValue={p?.priority ?? 0} className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.startsAt")}</span>
        <input type="datetime-local" name="startsAt" defaultValue={local(p?.startsAt ?? null)} className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-semibold">{t("marketing.endsAt")}</span>
        <input type="datetime-local" name="endsAt" defaultValue={local(p?.endsAt ?? null)} className={field} />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="mb-1 block font-semibold">{t("marketing.imageUrl")}</span>
        <input name="imageUrl" maxLength={300} defaultValue={p?.imageUrl ?? ""} placeholder="https://… /api/media/…" className={field} />
      </label>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-semibold">{t("marketing.theme")}</legend>
        <div className="flex flex-wrap gap-2">
          {PROMO_THEME_IDS.map((id) => {
            const th = promoTheme(id);
            return (
              <label key={id} className="cursor-pointer">
                <input type="radio" name="theme" value={id} defaultChecked={(p?.theme ?? "gold") === id} className="peer sr-only" />
                <span className="flex min-h-10 items-center rounded-full border-2 border-transparent px-4 text-sm font-bold capitalize peer-checked:border-foreground" style={{ background: th.bg, color: th.fg }}>
                  {id}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <details className="md:col-span-2">
        <summary className="cursor-pointer text-sm font-semibold">{t("marketing.targeting")}</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input name="cities" maxLength={500} defaultValue={p?.target?.cities?.join(", ") ?? ""} placeholder={t("marketing.cities")} aria-label={t("marketing.cities")} className={field} />
          <div className="flex flex-wrap gap-3 text-sm">
            {(["restaurant", "transport"] as const).map((k) => (
              <label key={k} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" name="kinds" value={k} defaultChecked={p?.target?.kinds?.includes(k)} className="size-5" /> {t(`messages.kindsBiz.${k}`)}
              </label>
            ))}
          </div>
        </div>
      </details>
      <button className={`${btn} bg-primary text-primary-foreground md:col-span-2`} data-testid={p ? "campaign-update" : "campaign-create"}>
        {p ? t("marketing.save") : t("marketing.create")}
      </button>
    </form>
  );

  return (
    <div className="flex flex-col gap-6" data-testid="admin-marketing">
      <div>
        <h1 className="text-2xl font-extrabold">{t("marketing.title")}</h1>
        <p className="text-muted-foreground">{t("marketing.intro")}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.promoCreated")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {t("marketing.error")}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("marketing.kpi.live"), String(live.length)],
          [t("marketing.kpi.views"), String(views)],
          [t("marketing.kpi.clicks"), String(clicks)],
          [t("marketing.kpi.ctr"), ctr(views, clicks)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-muted-foreground">{k}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      <Card className="flex flex-col gap-3" id="featured">
        <CardTitle>★ {t("marketing.featuredTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("marketing.featuredHint")}</p>
        <div className="grid gap-3 md:grid-cols-3" data-testid="featured-slots">
          {[1, 2, 3].map((rank) => {
            const cur = featured.find((f) => f.rank === rank);
            return (
              <form key={rank} action={featuredAction} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <input type="hidden" name="back" value="marketing" />
                <input type="hidden" name="rank" value={rank} />
                <p className="text-sm font-bold">{t("featuredRank", { n: rank })}</p>
                <select name="id" defaultValue={cur?.id ?? ""} required className={field} aria-label={t("featuredRank", { n: rank })} data-testid={`featured-slot-${rank}`}>
                  <option value="" disabled>
                    {t("marketing.chooseBusiness")}
                  </option>
                  {published.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.city ? ` · ${r.city}` : ""}
                    </option>
                  ))}
                </select>
                <button className={`${btn} border border-border bg-surface text-sm`} data-testid={`featured-save-${rank}`}>
                  {t("marketing.feature")}
                </button>
              </form>
            );
          })}
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("marketing.campaigns", { n: campaigns.length })}</h2>
        {campaigns.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">{t("marketing.none")}</p>}
        {campaigns.map((c) => {
          const th = promoTheme(c.theme);
          const st = promoState(c);
          return (
            <Card key={c.id} id={`m-${c.id}`} className="flex scroll-mt-20 flex-col gap-3" data-testid="campaign-row">
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-full max-w-sm shrink-0 rounded-2xl p-4 shadow" style={{ background: th.bg, color: th.fg }}>
                  {c.badge && (
                    <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-extrabold" style={{ background: th.accent, color: th.bg }}>
                      {c.badge}
                    </span>
                  )}
                  <p className="text-lg leading-tight font-extrabold">{c.title.fr}</p>
                  {c.body?.fr && <p className="mt-1 text-sm opacity-90">{c.body.fr}</p>}
                  {c.ctaLabel?.fr && <p className="mt-2 text-sm font-bold underline">{c.ctaLabel.fr} →</p>}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE[st]}`}>{t(`marketing.states.${st}`)}</span>
                    <span className="font-semibold">{place(c.placement)}</span>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {c.startsAt ? format.dateTime(c.startsAt, { dateStyle: "medium" }) : t("marketing.now")} → {c.endsAt ? format.dateTime(c.endsAt, { dateStyle: "medium" }) : t("marketing.noEnd")}
                    {c.link && <span className="block font-mono text-xs">{c.link}</span>}
                  </p>
                  <p className="mt-1 font-semibold" data-testid="campaign-stats">
                    {t("marketing.stats", { views: c.views, clicks: c.clicks, ctr: ctr(c.views, c.clicks) })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {st !== "ended" && (
                      <form action={togglePlatformPromoAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="on" value={c.active ? "0" : "1"} />
                        <button className={`${btn} border border-border bg-surface text-sm`}>{c.active ? `⏸ ${t("marketing.pause")}` : `▶ ${t("marketing.resume")}`}</button>
                      </form>
                    )}
                    <form action={deletePlatformPromoAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message={t("marketing.deleteConfirm")} className={`${btn} border border-border bg-surface text-sm text-red-700`}>
                        {t("marketing.delete")}
                      </ConfirmButton>
                    </form>
                  </div>
                </div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary">✏️ {t("marketing.edit")}</summary>
                <div className="mt-3">{form(c)}</div>
              </details>
            </Card>
          );
        })}
      </section>

      <Card className="flex flex-col gap-3">
        <CardTitle>➕ {t("marketing.new")}</CardTitle>
        {form()}
      </Card>

      <Card>
        <CardTitle className="mb-1">🔥 {t("marketing.offersTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">{t("marketing.offersHint")}</p>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm" data-testid="business-offers">
            {offers.map(({ p, business, slug }) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/r/${slug}`} target="_blank" className="font-semibold text-primary">
                    {business}
                  </Link>{" "}
                  · {p.title.fr} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${STATE[promoState(p)]}`}>{t(`marketing.states.${promoState(p)}`)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t("marketing.stats", { views: p.views, clicks: p.clicks, ctr: ctr(p.views, p.clicks) })}
                  {p.active && promoState(p) !== "ended" && (
                    <form action={togglePlatformPromoAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="on" value="0" />
                      <button className="min-h-10 rounded-lg border border-border px-3 font-semibold">{t("marketing.pause")}</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

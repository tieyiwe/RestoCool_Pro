import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { businessReviews, reviewsEnabled, type ReviewSummary } from "@/lib/reviews";
import { reviewStatusAction, toggleReviewsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reviews"))("title") };
}

const FILTERS = ["all", "visible", "hidden"] as const;

function StarsText({ value }: { value: number }) {
  return (
    <span aria-label={`${value}/5`} role="img" className="text-[#E9B530]">
      {"★".repeat(Math.round(value))}
      <span className="text-muted-foreground/40">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

function Breakdown({ s }: { s: ReviewSummary }) {
  const max = Math.max(...Object.values(s.byStars), 1);
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {([5, 4, 3, 2, 1] as const).map((n) => (
        <li key={n} className="flex items-center gap-2">
          <span className="w-8 tabular-nums">{n} ★</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-[#E9B530]" style={{ width: `${(s.byStars[n] / max) * 100}%` }} />
          </span>
          <span className="w-6 text-right tabular-nums">{s.byStars[n]}</span>
        </li>
      ))}
    </ul>
  );
}

/** « Avis clients »: the business reads its reviews, hides or deletes them, and switches reviews on or off. */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ filter?: string; ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("reports.read");
  const [t, format, sp] = await Promise.all([getTranslations("reviews"), getFormatter(), searchParams]);
  const r = await ctx.repo.restaurant.get();
  if (!r) return null;
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as (typeof FILTERS)[number]) : "all";
  const canEdit = can(ctx.actor, "settings.write", { restaurantId: r.id });
  const on = reviewsEnabled(r);
  const data = await businessReviews({ db: getDb(), actor: ctx.actor, restaurantId: r.id }, filter);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5" data-testid="reviews-page">
      <div>
        <h1 className="text-2xl font-extrabold">⭐ {t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" data-testid="reviews-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.hidden")}
        </p>
      )}

      {/* On / off for the whole business. */}
      <Card className="flex flex-wrap items-center justify-between gap-3" data-testid="reviews-toggle">
        <div>
          <p className="font-bold">{on ? `🟢 ${t("onTitle")}` : `⚪ ${t("offTitle")}`}</p>
          <p className="text-sm text-muted-foreground">{on ? t("onHint") : t("offHint")}</p>
        </div>
        {canEdit && (
          <form action={toggleReviewsAction}>
            <input type="hidden" name="on" value={on ? "0" : "1"} />
            <button className={`min-h-11 rounded-xl px-4 font-bold ${on ? "border border-border" : "bg-primary text-primary-foreground"}`} data-testid="reviews-toggle-button">
              {on ? t("turnOff") : t("turnOn")}
            </button>
          </form>
        )}
      </Card>

      {/* Figures. */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">{t("publicAverage")}</p>
          <p className="text-3xl font-extrabold tabular-nums" data-testid="reviews-public-average">
            {data.visible.average ?? "—"}
          </p>
          {data.visible.average != null && <StarsText value={data.visible.average} />}
          <p className="text-xs text-muted-foreground">{t("publicCount", { n: data.visible.count })}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">{t("allAverage")}</p>
          <p className="text-3xl font-extrabold tabular-nums">{data.all.average ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{t("counts", { visible: data.counts.visible, hidden: data.counts.hidden })}</p>
        </Card>
        <Card>
          <Breakdown s={data.all} />
        </Card>
      </div>

      <nav className="flex gap-2" aria-label={t("filterLabel")}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/app/reviews" : `/app/reviews?filter=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className="flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold aria-[current=page]:bg-foreground aria-[current=page]:text-background"
          >
            {t(`filters.${f}`)}
          </Link>
        ))}
      </nav>

      {data.list.length === 0 ? (
        <Card className="text-center text-muted-foreground">{t("none")}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.list.map((rv) => (
            <li key={rv.id} data-testid="review-row" data-status={rv.status}>
              <Card className={rv.status === "hidden" ? "border-dashed opacity-80" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StarsText value={rv.rating} />
                  <span className="text-xs text-muted-foreground">
                    {format.dateTime(rv.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    {rv.orderCode ? ` · ${rv.orderCode}` : ""}
                  </span>
                </div>
                {rv.comment ? <p className="mt-2 whitespace-pre-line">{rv.comment}</p> : <p className="mt-2 text-sm text-muted-foreground italic">{t("noComment")}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {rv.authorName || t("anonymous")} · {rv.lang.toUpperCase()}
                  {rv.status === "hidden" && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-semibold">{t("hiddenBadge")}</span>}
                </p>
                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* One form per action: the state travels in a hidden field. */}
                    <form action={reviewStatusAction}>
                      <input type="hidden" name="id" value={rv.id} />
                      <input type="hidden" name="filter" value={filter} />
                      <input type="hidden" name="status" value={rv.status === "visible" ? "hidden" : "visible"} />
                      {rv.status === "visible" ? (
                        <button className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold" data-testid="review-hide">
                          🙈 {t("hide")}
                        </button>
                      ) : (
                        <button className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold" data-testid="review-show">
                          👁️ {t("show")}
                        </button>
                      )}
                    </form>
                    <form action={reviewStatusAction}>
                      <input type="hidden" name="id" value={rv.id} />
                      <input type="hidden" name="filter" value={filter} />
                      <input type="hidden" name="status" value="deleted" />
                      <ConfirmButton message={t("deleteConfirm")} className="border border-border" data-testid="review-delete">
                        🗑️ {t("delete")}
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}

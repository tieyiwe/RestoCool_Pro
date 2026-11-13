"use client";

import { useCallback, useEffect, useState } from "react";
import type { makeT } from "@/lib/public-menu/translate";
import { cn } from "@/lib/utils";
import { deviceId } from "./seating";

type T = ReturnType<typeof makeT>;
type Lang = "fr" | "en" | "zh";

export type PublicReview = { id: string; rating: number; comment: string | null; authorName: string | null; lang: string; createdAt: string };
export type ReviewsData = { summary: { count: number; average: number | null; byStars: Record<string, number> }; reviews: PublicReview[]; reviewed: string[] };

/** Visible reviews of the business (+ which of this phone's orders are already reviewed). */
export function useReviews(slug: string, enabled: boolean) {
  const [data, setData] = useState<ReviewsData | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    const res = await fetch(`/api/public/reviews?slug=${encodeURIComponent(slug)}&deviceId=${encodeURIComponent(deviceId())}`, { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as ({ enabled: boolean } & Partial<ReviewsData>) | null) : null;
    if (body?.enabled && body.summary && body.reviews) setData({ summary: body.summary, reviews: body.reviews, reviewed: body.reviewed ?? [] });
  }, [slug, enabled]);
  useEffect(() => {
    void load();
  }, [load]);
  const more = useCallback(async () => {
    if (!data) return;
    const res = await fetch(`/api/public/reviews?slug=${encodeURIComponent(slug)}&offset=${data.reviews.length}`, { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as Partial<ReviewsData> | null) : null;
    if (body?.reviews) setData({ ...data, reviews: [...data.reviews, ...body.reviews.filter((r) => !data.reviews.some((x) => x.id === r.id))] });
  }, [data, slug]);
  return { data, reload: load, more };
}

export function Stars({ value, size = "text-base", label }: { value: number; size?: string; label?: string }) {
  return (
    <span className={cn("inline-flex leading-none tracking-tight", size)} role="img" aria-label={label ?? `${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(value) ? "text-[#E9B530]" : "text-muted-foreground/40"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

/** « Avis clients » on the public page: average, stars breakdown, latest visible reviews. */
export function ReviewsSection({ data, t, lang, onMore }: { data: ReviewsData; t: T; lang: Lang; onMore: () => void }) {
  if (data.summary.count === 0) return null;
  const when = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Ouagadougou" });
  const max = Math.max(...Object.values(data.summary.byStars), 1);
  return (
    <section id="reviews" className="mt-8 scroll-mt-40 rounded-2xl border border-border bg-surface p-4" aria-labelledby="reviews-title" data-testid="reviews-section">
      <h2 id="reviews-title" className="font-display mb-3 text-xl font-extrabold">
        {t("reviewsTitle")}
      </h2>
      <div className="mb-4 flex items-center gap-4">
        <div className="text-center">
          <p className="text-4xl font-extrabold tabular-nums" data-testid="reviews-average">
            {data.summary.average?.toLocaleString(lang === "zh" ? "zh-CN" : lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </p>
          <Stars value={data.summary.average ?? 0} />
          <p className="text-xs text-muted-foreground">{t("reviewsCount", { n: data.summary.count })}</p>
        </div>
        <ul className="flex-1 text-xs" aria-hidden>
          {[5, 4, 3, 2, 1].map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className="w-3 tabular-nums">{s}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-[#E9B530]" style={{ width: `${((data.summary.byStars[s] ?? 0) / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex flex-col gap-3">
        {data.reviews.map((r) => (
          <li key={r.id} className="border-t border-border pt-3" data-testid="review">
            <div className="flex items-center justify-between gap-2">
              <Stars value={r.rating} />
              <span className="text-xs text-muted-foreground">{when.format(new Date(r.createdAt))}</span>
            </div>
            {r.comment && (
              <p className="mt-1 text-sm whitespace-pre-line" lang={r.lang}>
                {r.comment}
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.authorName || t("reviewAnonymous")} · ✓ {t("reviewVerified")}
            </p>
          </li>
        ))}
      </ul>
      {data.reviews.length < data.summary.count && (
        <button type="button" onClick={onMore} className="mt-3 min-h-11 w-full rounded-xl border border-border text-sm font-semibold">
          {t("reviewsMore")}
        </button>
      )}
    </section>
  );
}

/** After « Servi »: stars (required), a comment and a first name (optional). One review per order. */
export function ReviewForm({ slug, orderId, t, lang, onDone }: { slug: string; orderId: string; t: T; lang: Lang; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  if (state === "done")
    return (
      <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" data-testid="review-thanks">
        🙏 {t("reviewThanks")}
      </p>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-11 w-full rounded-xl border-2 border-[#E9B530] text-sm font-bold" data-testid="review-open">
        ⭐ {t("reviewAsk")}
      </button>
    );
  const send = async () => {
    if (!rating) return;
    setState("sending");
    const res = await fetch("/api/public/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, deviceId: deviceId(), orderId, rating, lang, ...(comment.trim() ? { comment: comment.trim() } : {}), ...(name.trim() ? { authorName: name.trim() } : {}) }),
    }).catch(() => null);
    if (res && (res.ok || res.status === 409)) {
      setState("done");
      onDone();
    } else setState("error");
  };
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="review-form">
      <p className="text-sm font-semibold">{t("reviewAsk")}</p>
      <div role="radiogroup" aria-label={t("reviewStars")} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t("reviewStarN", { n })}
            onClick={() => setRating(n)}
            className={cn("flex h-11 w-11 items-center justify-center rounded-full text-3xl leading-none", n <= rating ? "text-[#E9B530]" : "text-muted-foreground/40")}
            data-testid={`review-star-${n}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={600} rows={3} placeholder={t("reviewCommentPh")} className="w-full rounded-xl border border-border bg-background p-3 text-base" data-testid="review-comment" />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t("reviewNamePh")} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base" data-testid="review-name" />
      {state === "error" && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {t("reviewError")}
        </p>
      )}
      <button type="button" disabled={!rating || state === "sending"} onClick={() => void send()} className="min-h-11 rounded-xl bg-[var(--accent)] font-bold text-[var(--on-accent)] disabled:opacity-50" data-testid="review-send">
        {t("reviewSend")}
      </button>
    </div>
  );
}

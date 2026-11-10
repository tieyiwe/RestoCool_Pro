"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { GUIDES, type Audience } from "./guide-scenes";
import { useSeenGuides } from "./guide-player";

/** Dashboard card « Apprendre à utiliser RestoCool »: next tutorials to watch and progress. */
export function LearnCard({ audience }: { audience: Audience }) {
  const t = useTranslations("guide");
  const seen = useSeenGuides();
  const list = GUIDES.filter((g) => g.audience === audience);
  const done = list.filter((g) => seen.has(g.id)).length;
  const next = list.filter((g) => !seen.has(g.id)).slice(0, 3);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm" data-testid="learn-card" aria-labelledby="learn-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="learn-title" className="text-lg font-bold">
          🎓 {t("cardTitle")}
        </h2>
        <span className="text-sm text-muted-foreground">{t("progress", { done, total: list.length })}</span>
      </div>
      <div className="my-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary" style={{ width: `${(done / list.length) * 100}%` }} />
      </div>
      {next.length === 0 ? (
        <p className="text-sm">{t("allSeen")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {next.map((g) => (
            <li key={g.id}>
              <Link href={`/app/guide?for=${audience}&g=${g.id}`} className="flex min-h-14 items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm font-semibold hover:bg-muted">
                <span className="text-xl" aria-hidden>
                  {g.icon}
                </span>
                {t(`items.${g.id}.title`)}
                <span className="ml-auto text-xs text-muted-foreground">▶</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/app/guide?for=${audience}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">
        {t("seeAll")} →
      </Link>
    </section>
  );
}

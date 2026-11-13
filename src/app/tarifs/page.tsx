import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { JsonLd } from "@/components/seo/json-ld";
import { PLAN_IDS, PLANS, type PlanFeature, type PlanId } from "@/config/plans";
import { formatFCFA } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform/settings";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { OG_BASE, siteBase } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricingPage");
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
    alternates: { canonical: "/tarifs" },
    openGraph: { ...OG_BASE, title: t("metaTitle"), description: t("metaDescription"), url: "/tarifs" },
  };
}

/** A cell of the comparison table: included, not included, a value, or « Bientôt » (not built yet). */
type Cell = true | false | "soon" | string;
type RowDef = { key: string; cells: (p: PlanId) => Cell };

const has = (f: PlanFeature) => (p: PlanId) => PLANS[p].features.has(f);
const all = () => true;

/**
 * Comparison rows. Everything comes from src/config/plans.ts so the page can never promise more
 * than the app enforces; features not built yet say « Bientôt » (honesty rule).
 */
function rows(t: (k: string, v?: Record<string, string | number>) => string): Array<{ group: string; rows: RowDef[] }> {
  const limit = (n: number) => (Number.isFinite(n) ? String(n) : t("unlimited"));
  return [
    {
      group: "menu",
      rows: [
        { key: "menu", cells: all },
        { key: "items", cells: (p) => limit(PLANS[p].limits.menuItems) },
        { key: "qr", cells: (p) => (PLANS[p].features.has("qrPerSeat") ? t("cells.qrPerSeat") : t("cells.qrOne")) },
        { key: "rc", cells: all },
        { key: "offlineMenu", cells: all },
        { key: "whatsapp", cells: all },
      ],
    },
    {
      group: "service",
      rows: [
        { key: "ordering", cells: has("ordering") },
        { key: "shared", cells: has("ordering") },
        { key: "kitchen", cells: has("kitchenDisplay") },
        { key: "floor", cells: has("kitchenDisplay") },
        { key: "reviews", cells: has("ordering") },
        { key: "reservations", cells: has("reservations") },
      ],
    },
    {
      group: "team",
      rows: [
        { key: "staff", cells: (p) => (PLANS[p].limits.staff === 0 ? false : limit(PLANS[p].limits.staff)) },
        { key: "pin", cells: has("staff") },
        { key: "reports", cells: has("reports") },
        { key: "staffPerformance", cells: has("staffPerformance") },
      ],
    },
    {
      group: "growth",
      rows: [
        { key: "promotions", cells: has("promotions") },
        { key: "multiBranch", cells: (p) => (PLANS[p].features.has("multiBranch") ? "soon" : false) },
        { key: "hideBadge", cells: has("hideBadge") },
        { key: "support", cells: all },
        { key: "priority", cells: (p) => p === "business" },
      ],
    },
  ];
}

function CellView({ c, yes, no, soon }: { c: Cell; yes: string; no: string; soon: string }) {
  if (c === true)
    return (
      <span className="inline-flex justify-center text-vert">
        <Check className="h-5 w-5" aria-hidden />
        <span className="sr-only">{yes}</span>
      </span>
    );
  if (c === false)
    return (
      <span className="inline-flex justify-center text-encre-2/50">
        <Minus className="h-5 w-5" aria-hidden />
        <span className="sr-only">{no}</span>
      </span>
    );
  if (c === "soon") return <span className="rounded-full bg-or/20 px-2 py-0.5 text-xs font-bold text-encre">{soon}</span>;
  return <span className="text-sm font-semibold">{c}</span>;
}

/** /tarifs: the plans in detail — cards, full comparison, how to pay, questions. */
export default async function PricingPage() {
  const t = await getTranslations("pricingPage");
  const tl = await getTranslations("landing");
  const platform = await getPlatformSettings().catch(() => ({ freeLaunch: false }));
  const base = await siteBase();
  const groups = rows(t);
  const faq = (["q1", "q2", "q3", "q4", "q5", "q6"] as const).map((k) => ({ q: t(`faq.${k}.q`), a: t(`faq.${k}.a`) }));
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "RestoCool", url: `${base}/` },
      { name: t("title"), url: `${base}/tarifs` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
  return (
    <div className="min-h-dvh bg-creme text-encre" data-testid="pricing-page">
      <JsonLd data={jsonLd} />
      <header className="sticky top-0 z-40 border-b border-ligne/70 bg-creme/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="RestoCool">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/restaurants" className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-sable sm:inline-flex">
              {tl("nav.restaurants")}
            </Link>
            <LocaleSwitcher />
            <Link href="/sign-up" className="inline-flex min-h-11 items-center rounded-xl bg-vert px-4 text-sm font-bold whitespace-nowrap text-creme">
              {tl("nav.ctaShort")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-6 text-center">
          <nav aria-label={t("breadcrumb")} className="mb-4 text-sm text-encre-2">
            <Link href="/" className="hover:underline">
              RestoCool
            </Link>{" "}
            › <span aria-current="page">{t("title")}</span>
          </nav>
          <h1 className="font-display text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-encre-2">{t("intro")}</p>
          {platform.freeLaunch && (
            <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-vert/40 bg-vert/10 px-4 py-3 font-semibold text-vert" data-testid="pricing-launch">
              🎁 {t("launch")}
            </p>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8" aria-label={t("plansLabel")}>
          <PricingCards />
          <p className="mt-6 text-center text-sm text-encre-2">{tl("pricing.note")}</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby="compare-title">
          <h2 id="compare-title" className="font-display text-2xl font-extrabold sm:text-3xl">
            {t("compareTitle")}
          </h2>
          <p className="mt-1 text-encre-2">{t("compareIntro")}</p>
          {/* Phones: the table scrolls inside its own box (the page never scrolls sideways). */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-ligne bg-white" data-testid="pricing-compare">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead className="sticky top-0 bg-sable">
                <tr>
                  <th scope="col" className="w-2/5 px-4 py-3 text-sm">
                    <span className="sr-only">{t("feature")}</span>
                  </th>
                  {PLAN_IDS.map((p) => (
                    <th key={p} scope="col" className="px-3 py-3 text-center">
                      <span className="block font-display text-lg font-extrabold">{tl(`pricing.${p}.name`)}</span>
                      <span className="text-xs font-semibold text-encre-2 tabular-nums">
                        {formatFCFA(PLANS[p].priceMonthly)}
                        {PLANS[p].priceMonthly > 0 ? ` ${tl("pricing.month")}` : ""}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.group}>
                  <tr>
                    <th colSpan={4} scope="colgroup" className="bg-creme px-4 pt-5 pb-2 text-xs font-extrabold tracking-wide text-encre-2 uppercase">
                      {t(`groups.${g.group}`)}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.key} className="border-t border-ligne" data-testid={`compare-${r.key}`}>
                      <th scope="row" className="px-4 py-3 text-sm font-medium">
                        {t(`rows.${r.key}`)}
                      </th>
                      {PLAN_IDS.map((p) => (
                        <td key={p} className={cn("px-3 py-3 text-center", p === "pro" && "bg-or/5")} data-plan={p}>
                          <CellView c={r.cells(p)} yes={t("yes")} no={t("no")} soon={t("soon")} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-3 text-sm text-encre-2">{t("soonNote")}</p>
        </section>

        <section className="border-y border-ligne bg-sable/60" aria-labelledby="pay-title">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 id="pay-title" className="font-display text-2xl font-extrabold">
                {t("pay.title")}
              </h2>
              <p className="mt-2 text-encre-2">{t("pay.intro")}</p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3 md:col-span-2">
              {(["s1", "s2", "s3"] as const).map((s, i) => (
                <li key={s} className="rounded-2xl border border-ligne bg-white p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-vert font-bold text-creme">{i + 1}</span>
                  <p className="mt-3 font-bold">{t(`pay.${s}.title`)}</p>
                  <p className="mt-1 text-sm text-encre-2">{t(`pay.${s}.text`)}</p>
                </li>
              ))}
            </ol>
            <ul className="flex flex-wrap gap-2 md:col-span-3">
              {(["om", "moov", "cash", "noData"] as const).map((k) => (
                <li key={k} className="rounded-full border border-ligne bg-white px-3 py-1.5 text-sm font-semibold">
                  {t(`pay.badges.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-12" aria-labelledby="pfaq-title">
          <h2 id="pfaq-title" className="font-display text-2xl font-extrabold sm:text-3xl">
            {t("faqTitle")}
          </h2>
          <div className="mt-6 flex flex-col gap-3">
            {faq.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-ligne bg-white p-4 open:shadow-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold">
                  {f.q}
                  <span className="text-xl text-encre-2 transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-encre-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="rounded-3xl bg-nuit px-6 py-10 text-center text-creme">
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t("final.title")}</h2>
            <p className="mx-auto mt-2 max-w-xl text-creme/80">{t("final.text")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/sign-up" className="inline-flex min-h-12 items-center rounded-xl bg-or px-6 font-bold text-encre" data-testid="pricing-cta">
                {tl("pricing.ctaFree")}
              </Link>
              <Link href="/demo" className="inline-flex min-h-12 items-center rounded-xl border border-creme/40 px-6 font-bold">
                {tl("seeDemo")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ligne">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-encre-2">
          <Link href="/" className="hover:underline">
            ← {t("backHome")}
          </Link>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:underline">
              {t("privacy")}
            </Link>
            <Link href="/terms" className="hover:underline">
              {t("terms")}
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

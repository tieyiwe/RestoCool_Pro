import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { RestaurantCard } from "@/components/directory/restaurant-card";
import { getDb } from "@/db";
import { featuredRestaurants } from "@/lib/directory";
import {
  Armchair,
  BellRing,
  CalendarCheck,
  ArrowRight,
  Camera,
  Check,
  ChefHat,
  ChevronDown,
  LayoutDashboard,
  Languages,
  MessageCircle,
  PencilLine,
  QrCode,
  Smartphone,
  Users,
  WifiOff,
} from "lucide-react";
import { LocalBadge } from "@/components/brand/local-badge";
import { Logo } from "@/components/brand/logo";
import { DemoShowcase } from "@/components/demo/demo-showcase";
import { PhoneMock } from "@/components/landing/phone-mock";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LEGAL } from "@/config/legal";
import { LOCAL_CLAIMS } from "@/config/marketing";
import { PLANS } from "@/config/plans";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CodeForm } from "@/components/code-entry/code-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return {
    title: { absolute: `RestoCool · ${t("hero.title")} ${t("hero.titleAccent")}` },
    description: t("hero.subtitle"),
    openGraph: { title: "RestoCool", description: t("hero.subtitle"), siteName: "RestoCool", type: "website" },
  };
}

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-or px-6 text-base font-bold text-encre shadow-lg shadow-or/20 transition hover:-translate-y-0.5 hover:shadow-xl";
const ghostBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-creme/30 px-6 text-base font-bold text-creme transition hover:bg-creme/10";
const section = "mx-auto w-full max-w-6xl px-4 sm:px-6";

/**
 * Public home page (restocool.com). Server-rendered; the only client JS is the demo animation.
 * Local claims appear only when switched on in src/config/marketing.ts (honesty rule).
 */
export default async function HomePage() {
  const t = await getTranslations("landing");
  const tb = await getTranslations("brand");
  const tl = await getTranslations("legal");
  const tc = await getTranslations("codeEntry");
  const td = await getTranslations("directory");
  const locale = await getLocale();
  // Featured restaurants are optional: the page renders without a database (build) or with none chosen.
  const featured = await (async () => featuredRestaurants(getDb()))().catch(() => []);
  const year = new Date().getUTCFullYear();

  const features = [
    { key: "menu", icon: Languages, ready: true },
    { key: "photos", icon: Camera, ready: true },
    { key: "qr", icon: QrCode, ready: true },
    { key: "seats", icon: Armchair, ready: true },
    { key: "whatsapp", icon: MessageCircle, ready: true },
    { key: "offline", icon: WifiOff, ready: true },
    { key: "orders", icon: BellRing, ready: false },
    { key: "staff", icon: Users, ready: false },
    { key: "reservations", icon: CalendarCheck, ready: false },
  ] as const;

  const plans = [
    { id: "gratuit", price: PLANS.gratuit.priceMonthly, popular: false, cta: t("pricing.ctaFree") },
    { id: "pro", price: PLANS.pro.priceMonthly, popular: true, cta: t("pricing.cta") },
    { id: "business", price: PLANS.business.priceMonthly, popular: false, cta: t("pricing.cta") },
  ] as const;

  const who = [
    ["🔥", "maquis"],
    ["🍽️", "restaurant"],
    ["🍹", "lounge"],
    ["🛍️", "fastfood"],
    ["🏨", "hotel"],
    ["🥘", "catering"],
  ] as const;

  return (
    <div className="bg-creme text-encre">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-ligne/70 bg-creme/90 backdrop-blur">
        <div className={cn(section, "flex h-16 items-center justify-between gap-3")}>
          <Link href="/" aria-label="RestoCool" className="mr-2 shrink-0">
            <Logo />
          </Link>
          <nav aria-label={t("nav.menu")} className="hidden items-center gap-0.5 text-sm font-semibold whitespace-nowrap xl:flex">
            <a href="#features" className="hidden rounded-lg px-3 py-2 hover:bg-sable 2xl:inline">
              {t("nav.features")}
            </a>
            <a href="#how" className="rounded-lg px-3 py-2 hover:bg-sable">
              {t("nav.how")}
            </a>
            <Link href="/restaurants" className="rounded-lg px-3 py-2 hover:bg-sable">
              {t("nav.restaurants")}
            </Link>
            <a href="#pricing" className="rounded-lg px-3 py-2 hover:bg-sable">
              {t("nav.pricing")}
            </a>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 hover:bg-sable 2xl:inline">
              {t("nav.faq")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            <Link href="/c" className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap hover:bg-sable lg:flex">
              {tc("short")}
            </Link>
            <Link href="/sign-in" className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap hover:bg-sable md:flex">
              {t("nav.signIn")}
            </Link>
            <Link href="/sign-up" className="inline-flex min-h-11 items-center rounded-xl bg-vert px-4 text-sm font-bold whitespace-nowrap text-creme hover:opacity-90">
              {t("nav.cta")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden bg-nuit text-creme">
          <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
            <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-vert/50 blur-3xl" />
            <div className="absolute -right-24 -bottom-40 h-[26rem] w-[26rem] rounded-full bg-or/20 blur-3xl" />
            <div className="rc-weave absolute inset-0 opacity-20" />
          </div>
          <div className={cn(section, "relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-24")}>
            <div className="flex flex-col items-start gap-6">
              {LOCAL_CLAIMS.founderBurkinabe ? (
                <LocalBadge label={tb("local")} />
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-creme/20 bg-creme/5 px-3 py-1 text-sm font-semibold text-creme/90">
                  <span className="h-2 w-2 rounded-full bg-or" aria-hidden />
                  {t("hero.eyebrow")}
                </span>
              )}
              <h1 className="font-display text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
                {t("hero.title")} <span className="text-or">{t("hero.titleAccent")}</span>
              </h1>
              <p className="max-w-xl text-lg text-creme/85">{t("hero.subtitle")}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link href="/sign-up" className={primaryBtn}>
                  {t("hero.cta")}
                </Link>
                <Link href="/r/restaurant-demo" className={ghostBtn}>
                  <Smartphone className="h-5 w-5" aria-hidden />
                  {t("hero.demo")}
                </Link>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-creme/85 sm:grid-cols-2">
                {(["chip1", "chip2", "chip3", "chip4"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-or" aria-hidden />
                    {t(`hero.${k}`)}
                  </li>
                ))}
              </ul>
              {LOCAL_CLAIMS.founderBurkinabe && <p className="text-sm font-semibold text-or">{tb("proud")}</p>}
            </div>
            <div className="pb-4 lg:pb-0">
              <PhoneMock
                s={{ newOrder: t("mock.newOrder"), table: t("mock.table"), items: t("mock.items"), served: t("mock.served"), open: t("mock.open") }}
              />
            </div>
          </div>
          {/* proof strip */}
          <div className="relative border-t border-creme/10 bg-black/15">
            <ul className={cn(section, "grid grid-cols-2 gap-4 py-5 text-center text-sm font-semibold text-creme/90 md:grid-cols-4")}>
              {(["languages", "noApp", "qr", "payments"] as const).map((k) => (
                <li key={k}>{t(`strip.${k}`)}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- Customers at a restaurant: type the code under the QR ---------------- */}
        <section id="code" className="border-b border-sable bg-creme" data-testid="home-code">
          <div className={cn(section, "flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between")}>
            <div>
              <h2 className="font-display text-xl font-extrabold">{tc("homeTitle")}</h2>
              <p className="text-encre-2">{tc("homeText")}</p>
            </div>
            <CodeForm compact />
          </div>
        </section>

        {/* ---------------- Featured restaurants (chosen by the platform admin) ---------------- */}
        <section className={cn(section, "pt-16")} data-testid="home-featured">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{td("homeTitle")}</h2>
              <p className="mt-1 text-encre-2">{td("homeText")}</p>
            </div>
            <Link href="/restaurants" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ligne bg-white px-4 font-bold hover:bg-sable" data-testid="home-directory-link">
              {td("browse")} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {featured.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((r) => (
                <li key={r.slug}>
                  <RestaurantCard r={r} locale={locale} cta={td("open")} featuredLabel={td("featuredBadge")} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- Digitize the service you already run ---------------- */}
        <section id="how" className={cn(section, "scroll-mt-16 py-20")} data-testid="home-digitize">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold tracking-widest text-vert uppercase">{t("digitize.eyebrow")}</p>
            <h2 className="font-display mt-2 text-3xl font-extrabold sm:text-4xl">{t("digitize.title")}</h2>
            <p className="mt-3 text-lg text-encre-2">{t("digitize.subtitle")}</p>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-4">
            {(
              [
                ["scan", QrCode],
                ["confirm", BellRing],
                ["cook", ChefHat],
                ["record", LayoutDashboard],
              ] as const
            ).map(([k, Icon], i) => (
              <li key={k} className="relative flex flex-col gap-3 rounded-3xl border border-ligne bg-white p-6 shadow-sm">
                <span className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vert/10 text-vert">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-sable" aria-hidden>
                    {i + 1}
                  </span>
                </span>
                <h3 className="text-lg font-extrabold">{t(`digitize.steps.${k}.title`)}</h3>
                <p className="text-encre-2">{t(`digitize.steps.${k}.text`)}</p>
                <p className="mt-auto rounded-xl bg-creme px-3 py-2 text-sm text-encre-2">
                  <span className="font-semibold text-encre">{t("digitize.before")}</span> {t(`digitize.steps.${k}.before`)}
                </p>
                {i < 3 && <ArrowRight className="absolute top-1/2 -right-4 z-10 hidden h-6 w-6 -translate-y-1/2 text-vert md:block" aria-hidden />}
              </li>
            ))}
          </ol>
          {/* What the owner finds in the dashboard */}
          <div className="mt-10 grid items-center gap-8 rounded-3xl bg-nuit p-6 text-creme sm:p-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h3 className="font-display text-2xl font-extrabold sm:text-3xl">{t("digitize.recordsTitle")}</h3>
              <p className="mt-3 text-creme/85">{t("digitize.recordsText")}</p>
              <ul className="mt-5 flex flex-col gap-2">
                {(["r1", "r2", "r3", "r4"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-or" aria-hidden />
                    {t(`digitize.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-4 text-encre shadow-2xl" aria-hidden>
              <div className="grid grid-cols-3 gap-2">
                {[
                  [t("digitize.mock.orders"), "48"],
                  [t("digitize.mock.sales"), formatFCFA(186500)],
                  [t("digitize.mock.service"), "14 min"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-creme p-3">
                    <p className="text-[11px] text-encre-2">{label}</p>
                    <p className="text-base font-extrabold tabular-nums sm:text-lg">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex h-20 items-end gap-1 rounded-xl bg-creme p-2">
                {[2, 3, 6, 9, 7, 4, 3, 5, 8, 10, 6, 3].map((h, i) => (
                  <span key={i} className="flex-1 rounded-t bg-vert" style={{ height: `${h * 9}%` }} />
                ))}
              </div>
              <table className="mt-3 w-full text-left text-xs">
                <thead className="text-encre-2">
                  <tr>
                    <th className="py-1">{t("digitize.mock.staffNo")}</th>
                    <th className="py-1">{t("digitize.mock.name")}</th>
                    <th className="py-1 text-right">{t("digitize.mock.served")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["002", "Awa", 21],
                    ["004", "Issouf", 17],
                    ["005", "Mariam", 10],
                  ].map(([no, name, n]) => (
                    <tr key={String(no)} className="border-t border-ligne">
                      <td className="py-1 font-mono font-bold">{no}</td>
                      <td className="py-1">{name}</td>
                      <td className="py-1 text-right tabular-nums">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---------------- Why ---------------- */}
        <section className={cn(section, "py-20")}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t("why.title")}</h2>
            <p className="mt-3 text-lg text-encre-2">{t("why.subtitle")}</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {(
              [
                ["a", PencilLine],
                ["b", Camera],
                ["c", Languages],
              ] as const
            ).map(([k, Icon]) => (
              <article key={k} className="rounded-3xl border border-ligne bg-white p-7 shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-vert text-creme">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="font-display mt-5 text-xl font-extrabold">{t(`why.${k}.title`)}</h3>
                <p className="mt-2 text-encre-2">{t(`why.${k}.text`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------- Demo animation ---------------- */}
        <section id="demo" className="scroll-mt-16 border-y border-ligne bg-sable/60">
          <DemoShowcase />
        </section>

        {/* ---------------- Features ---------------- */}
        <section id="features" className={cn(section, "scroll-mt-16 py-20")}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t("features.title")}</h2>
            <p className="mt-3 text-lg text-encre-2">{t("features.subtitle")}</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ key, icon: Icon, ready }) => (
              <article key={key} className={cn("relative rounded-3xl border p-6", ready ? "border-ligne bg-white shadow-sm" : "border-dashed border-ligne bg-creme")}>
                <span
                  className={cn(
                    "absolute top-5 right-5 rounded-full px-2.5 py-0.5 text-xs font-bold",
                    ready ? "bg-emerald-100 text-emerald-900" : "bg-or/25 text-encre",
                  )}
                >
                  {ready ? t("features.available") : t("features.soon")}
                </span>
                <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", ready ? "bg-vert/10 text-vert" : "bg-sable text-encre-2")}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="font-display mt-4 text-lg font-extrabold">{t(`features.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm text-encre-2">{t(`features.${key}.text`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------- Built for here ---------------- */}
        <section className="bg-vert text-creme">
          <div className={cn(section, "grid gap-10 py-20 lg:grid-cols-[1fr_1.2fr] lg:items-center")}>
            <div>
              <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t("burkina.title")}</h2>
              <p className="mt-4 text-lg text-creme/85">{t("burkina.subtitle")}</p>
              <p className="font-display mt-6 text-2xl font-extrabold text-or">« {tb("greeting")} »</p>
              {LOCAL_CLAIMS.founderBurkinabe && (
                <div className="mt-6 flex flex-col items-start gap-2">
                  <LocalBadge label={tb("local")} className="bg-nuit" />
                  <p className="font-semibold">{t("burkina.founder")}</p>
                </div>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(["fcfa", "mobile", "whatsapp", "network", "french", "phone"] as const).map((k) => (
                <li key={k} className="flex gap-3 rounded-2xl bg-nuit/40 p-4">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-or" aria-hidden />
                  <span>{t(`burkina.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- Who ---------------- */}
        <section className={cn(section, "py-20")}>
          <h2 className="font-display text-center text-3xl font-extrabold sm:text-4xl">{t("who.title")}</h2>
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {who.map(([emoji, k]) => (
              <li key={k} className="flex flex-col items-center gap-3 rounded-3xl border border-ligne bg-white p-5 text-center shadow-sm">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sable text-3xl" aria-hidden>
                  {emoji}
                </span>
                <span className="font-semibold">{t(`who.${k}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section id="pricing" className="scroll-mt-16 border-y border-ligne bg-sable/60">
          <div className={cn(section, "py-20")}>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t("pricing.title")}</h2>
              <p className="mt-3 text-lg text-encre-2">{t("pricing.subtitle")}</p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {plans.map((p) => (
                <article
                  key={p.id}
                  className={cn(
                    "relative flex flex-col rounded-3xl p-7",
                    p.popular ? "bg-nuit text-creme shadow-2xl ring-2 ring-or lg:-translate-y-3" : "border border-ligne bg-white shadow-sm",
                  )}
                  data-testid={`plan-${p.id}`}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-or px-3 py-1 text-xs font-bold text-encre">{t("pricing.popular")}</span>
                  )}
                  <h3 className="font-display text-2xl font-extrabold">{t(`pricing.${p.id}.name`)}</h3>
                  <p className={cn("mt-1 text-sm", p.popular ? "text-creme/80" : "text-encre-2")}>{t(`pricing.${p.id}.desc`)}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-extrabold tabular-nums">{formatFCFA(p.price)}</span>
                    {p.price > 0 && <span className={p.popular ? "text-creme/70" : "text-encre-2"}>{t("pricing.month")}</span>}
                  </p>
                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                    {(["f1", "f2", "f3", "f4", "f5"] as const).map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className={cn("mt-0.5 h-4 w-4 shrink-0", p.popular ? "text-or" : "text-vert")} aria-hidden />
                        {t(`pricing.${p.id}.${f}`)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/sign-up"
                    className={cn(
                      "mt-7 inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-bold",
                      p.popular ? "bg-or text-encre" : "bg-vert text-creme",
                    )}
                  >
                    {p.cta}
                  </Link>
                </article>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-encre-2">{t("pricing.note")}</p>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className={cn(section, "scroll-mt-16 py-20")}>
          <h2 className="font-display text-center text-3xl font-extrabold sm:text-4xl">{t("faq.title")}</h2>
          <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-3">
            {([1, 2, 3, 4, 5, 6] as const).map((n) => (
              <details key={n} className="group rounded-2xl border border-ligne bg-white shadow-sm open:shadow-md">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-5 font-bold [&::-webkit-details-marker]:hidden">
                  {t(`faq.q${n}`)}
                  <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="-mt-2 px-5 pb-5 text-encre-2">
                  {t(`faq.a${n}`)}
                  {n === 6 && (
                    <>
                      {" "}
                      <Link href="/privacy" className="font-semibold text-vert underline">
                        {tl("privacy")}
                      </Link>
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------------- Final CTA ---------------- */}
        <section className={cn(section, "pb-20")}>
          <div className="relative overflow-hidden rounded-[2rem] bg-nuit px-6 py-14 text-center text-creme sm:px-12">
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-or/20 blur-3xl" />
            </div>
            <h2 className="font-display relative text-3xl font-extrabold sm:text-4xl">{t("final.title")}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-lg text-creme/85">{t("final.subtitle")}</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/sign-up" className={primaryBtn}>
                {t("final.cta")}
              </Link>
              <Link href="/r/restaurant-demo" className={ghostBtn}>
                {t("hero.demo")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-ligne bg-white">
        <div className={cn(section, "flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between")}>
          <div className="flex flex-col gap-2">
            <Link href="/" aria-label="RestoCool" className="self-start">
              <Logo />
            </Link>
            <p className="max-w-xs text-sm text-encre-2">{tb("tagline")}</p>
            <p className="text-sm text-encre-2">
              {t("footer.product", { publisher: LEGAL.publisher })} · {t("footer.group", { group: LEGAL.parentGroup })}
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm" aria-label={t("nav.menu")}>
            <a href="#features" className="hover:underline">
              {t("nav.features")}
            </a>
            <a href="#pricing" className="hover:underline">
              {t("nav.pricing")}
            </a>
            <Link href="/r/restaurant-demo" className="hover:underline">
              {t("footer.demo")}
            </Link>
            <Link href="/demo" className="hover:underline">
              {t("footer.animation")}
            </Link>
            <Link href="/privacy" className="hover:underline">
              {tl("privacy")}
            </Link>
            <Link href="/terms" className="hover:underline">
              {tl("terms")}
            </Link>
          </nav>
          <div className="sm:hidden">
            <LocaleSwitcher />
          </div>
        </div>
        <p className="border-t border-ligne py-4 text-center text-xs text-encre-2">{t("footer.rights", { year, publisher: LEGAL.publisher })}</p>
      </footer>
    </div>
  );
}

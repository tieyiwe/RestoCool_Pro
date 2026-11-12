import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { DirectorySearch } from "@/components/directory/directory-search";
import { RestaurantCard } from "@/components/directory/restaurant-card";
import { getDb } from "@/db";
import { featuredRestaurants, searchRestaurants } from "@/lib/directory";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("directory");
  return { title: t("title"), description: t("intro") };
}

/** Public directory of restaurants on RestoCool (published only). */
export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getTranslations("directory");
  const locale = await getLocale();
  const q = ((await searchParams).q ?? "").slice(0, 60);
  const [featured, initial] = await Promise.all([q ? Promise.resolve([]) : featuredRestaurants(getDb()), searchRestaurants(getDb(), q)]);
  return (
    <div className="min-h-dvh bg-creme text-encre">
      <header className="border-b border-ligne bg-creme/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="RestoCool">
            <Logo />
          </Link>
          <Link href="/sign-up" className="inline-flex min-h-11 items-center rounded-xl bg-vert px-4 text-sm font-bold whitespace-nowrap text-creme">
            {t("addMine")}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-lg text-encre-2">{t("intro")}</p>
        </div>
        {/* « À la une » steps aside while the visitor types a search. */}
        {featured.length > 0 && (
          <section aria-labelledby="featured-title" data-testid="directory-featured" className="[body:has(#dir-q:not(:placeholder-shown))_&]:hidden">
            <h2 id="featured-title" className="mb-4 text-xl font-extrabold">
              {t("featured")}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((r) => (
                <li key={r.slug}>
                  <RestaurantCard r={r} locale={locale} cta={t("open")} featuredLabel={t("featuredBadge")} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="all-title">
          <h2 id="all-title" className="mb-4 text-xl font-extrabold">
            {t("all")}
          </h2>
          <DirectorySearch
            initialQuery={q}
            initial={initial}
            locale={locale}
            s={{ label: t("searchLabel"), placeholder: t("placeholder"), empty: t("empty"), cta: t("open"), count: t("count"), searching: t("searching") }}
          />
        </section>
      </main>
    </div>
  );
}

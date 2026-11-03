import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { PoweredBadge } from "@/components/brand/powered-badge";
import { getDb } from "@/db";
import { findRestaurantBySlug, tenantRepo } from "@/db/repos/tenant";
import { getMemberContext } from "@/lib/auth/context";
import { formatFCFA } from "@/lib/format";
import { pickText } from "@/i18n/config";

// Public menu is always rendered in French; the visitor switches language client-side (M2).
const LOCALE = "fr";

const loadMenu = cache(async (slug: string) => {
  const db = getDb();
  let restaurant = await findRestaurantBySlug(db, slug);
  let preview = false;
  if (!restaurant) {
    // Owners/managers can preview their own unpublished menu.
    const draft = await findRestaurantBySlug(db, slug, { includeUnpublished: true });
    const member = draft ? await getMemberContext() : null;
    if (!draft || member?.repo.restaurantId !== draft.id) return null;
    restaurant = draft;
    preview = true;
  }
  const repo = tenantRepo(db, restaurant.id);
  const [categories, items, variants] = await Promise.all([repo.menu.categories(), repo.menu.items(), repo.menu.variants()]);
  return { restaurant, preview, categories: categories.filter((c) => c.active), items, variants };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await loadMenu((await params).slug);
  return { title: data?.restaurant.name ?? "Menu", robots: data?.preview ? { index: false } : undefined };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await loadMenu((await params).slug);
  if (!data) notFound();
  const t = await getTranslations("menu");
  const tc = await getTranslations("common");
  const { restaurant, categories, items, variants, preview } = data;

  return (
    <div
      data-menu-theme={restaurant.theme}
      style={{ ["--accent" as string]: restaurant.accentColor }}
      className="min-h-dvh bg-background text-foreground"
    >
      {preview && <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">{t("preview")}</p>}
      <header className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-extrabold">{restaurant.name}</h1>
        <p className="text-sm text-muted-foreground">{restaurant.city}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("shellNote")}</p>
      </header>

      <nav aria-label="Catégories" className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-border bg-background px-4 py-2">
        {categories.map((c) => (
          <a key={c.id} href={`#cat-${c.id}`} className="flex min-h-11 shrink-0 items-center rounded-full bg-muted px-4 text-sm font-semibold">
            {pickText(c.name, LOCALE)}
          </a>
        ))}
      </nav>

      <main className="mx-auto max-w-2xl px-4 pb-8">
        {categories.map((c) => {
          const catItems = items.filter((i) => i.categoryId === c.id);
          return (
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16 pt-6">
              <h2 className="mb-3 text-lg font-bold" style={{ color: "var(--accent)" }}>
                {pickText(c.name, LOCALE)}
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {catItems.map((item) => {
                  const itemVariants = variants.filter((v) => v.itemId === item.id);
                  const price =
                    itemVariants.length > 0
                      ? itemVariants.map((v) => formatFCFA(v.price)).join(" / ")
                      : (formatFCFA(item.price) ?? tc("onRequest"));
                  return (
                    <li key={item.id} className="flex items-start justify-between gap-3 p-3" data-testid="menu-item">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {item.code && <span className="mr-1 text-muted-foreground">{item.code}.</span>}
                          {pickText(item.name, LOCALE)}
                          {item.spicy > 0 && <span aria-label={t("spicy")}> {"🌶️".repeat(item.spicy)}</span>}
                        </p>
                        {item.name.zh && <p className="text-xs text-muted-foreground" lang="zh">{item.name.zh}</p>}
                      </div>
                      <p className="shrink-0 font-bold tabular-nums">{price}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </main>

      <footer className="safe-bottom border-t border-border px-4 py-6">
        <PoweredBadge />
      </footer>
    </div>
  );
}

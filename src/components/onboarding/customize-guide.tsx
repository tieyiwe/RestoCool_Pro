import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DEFAULT_ACCENT2 } from "@/config/palettes";
import type { restaurants } from "@/db/schema";
import { onAccent, textOn, THEME_BACKGROUNDS } from "@/lib/color";
import { cn } from "@/lib/utils";

type Restaurant = typeof restaurants.$inferSelect;
type Step = { key: "logo" | "cover" | "name" | "colors" | "contacts"; done: boolean; href: string };

export function customizeSteps(r: Restaurant): Step[] {
  return [
    { key: "logo", done: Boolean(r.logoUrl), href: "/app/settings#appearance" },
    { key: "cover", done: Boolean(r.coverUrl), href: "/app/settings#appearance" },
    { key: "name", done: Boolean(r.description?.fr?.trim()), href: "/app/settings#profile" },
    { key: "colors", done: Boolean(r.settings.accent2), href: "/app/settings#appearance" },
    { key: "contacts", done: Boolean(r.whatsapp || r.phones.length), href: "/app/settings#contacts" },
  ];
}

const Pin = ({ n, className }: { n: number; className?: string }) => (
  <span className={cn("absolute z-10 flex size-7 items-center justify-center rounded-full bg-[#E9B530] text-sm font-extrabold text-[#17231C] shadow ring-2 ring-white", className)} aria-hidden>
    {n}
  </span>
);

/**
 * « Personnalisez votre page »: the owner's own menu header drawn with what they have now, with
 * numbered pins (logo, photo, name and slogan, colours, contacts), and the steps to change each.
 */
export async function CustomizeGuide({ r }: { r: Restaurant }) {
  const t = await getTranslations("app.customize");
  const steps = customizeSteps(r);
  const doneCount = steps.filter((s) => s.done).length;
  const accent2 = r.settings.accent2 ?? DEFAULT_ACCENT2;
  const bg = THEME_BACKGROUNDS[r.theme];
  const fg = r.theme === "lacquer" ? "#F8EFE6" : "#17231C";
  return (
    <section className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-6" data-testid="customize-guide" aria-labelledby="customize-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="customize-title" className="font-display text-xl font-extrabold">
            🎨 {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold tabular-nums" data-testid="customize-progress">
          {t("progress", { done: doneCount, total: steps.length })}
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_1fr]">
        {/* The page as customers see it, with numbered pins. */}
        <figure className="relative mx-auto w-full max-w-72 overflow-visible">
          <div className="overflow-hidden rounded-2xl border border-border shadow" style={{ background: bg, color: fg }}>
            <div className="relative h-24 bg-cover bg-center" style={r.coverUrl ? { backgroundImage: `url(${r.coverUrl})` } : { background: `linear-gradient(135deg, ${r.accentColor}, ${r.accentColor}88)` }}>
              {!r.coverUrl && <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-60">📸</span>}
              <Pin n={2} className="top-2 right-2" />
            </div>
            <div className="relative h-1.5" style={{ background: `linear-gradient(90deg, ${r.accentColor} 0 55%, ${accent2} 55%)` }}>
              <Pin n={4} className="-top-3 left-1/2" />
            </div>
            <div className="flex gap-3 px-3 pt-3 pb-2">
              <span className="relative">
                {r.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the owner's logo
                  <img src={r.logoUrl} alt="" className="-mt-8 size-14 rounded-xl border-2 border-white bg-white object-cover shadow" />
                ) : (
                  <span className="-mt-8 flex size-14 items-center justify-center rounded-xl border-2 border-white text-xl font-extrabold shadow" style={{ background: r.accentColor, color: onAccent(r.theme) }}>
                    {r.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <Pin n={1} className="-top-10 -left-2" />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="font-display block truncate font-extrabold">{r.name}</span>
                <span className="block truncate text-xs opacity-75">{r.description?.fr?.trim() || t("sloganPlaceholder")}</span>
                <Pin n={3} className="-top-2 -right-1" />
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-black/10 px-3 py-2 text-xs">
              <span className="relative font-semibold" style={{ color: r.accentColor }}>
                {t("mockCategory")}
                <span className="mt-0.5 block h-1 w-8 rounded-full" style={{ background: accent2 }} />
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: accent2, color: textOn(accent2) }}>
                {t("mockNew")}
              </span>
            </div>
            <div className="relative flex items-center gap-2 border-t border-black/10 px-3 py-2 text-xs">
              💬 WhatsApp · 📞 +226
              <Pin n={5} className="top-1 right-2" />
            </div>
          </div>
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">{t("mockCaption")}</figcaption>
        </figure>

        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className={cn("flex min-h-14 items-start gap-3 rounded-2xl border p-3 hover:bg-muted", s.done ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-border")}
                data-testid={`customize-${s.key}`}
                data-done={s.done}
              >
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold", s.done ? "bg-emerald-600 text-white" : "bg-[#E9B530] text-[#17231C]")} aria-hidden>
                  {s.done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {t(`steps.${s.key}.title`)}
                    <span className="sr-only"> · {s.done ? t("done") : t("todo")}</span>
                  </span>
                  <span className="block text-sm text-muted-foreground">{t(`steps.${s.key}.text`)}</span>
                </span>
                <span className="shrink-0 self-center text-sm font-semibold text-primary">{s.done ? t("change") : t("doIt")} →</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href={`/r/${r.slug}`} className="flex min-h-12 items-center justify-center rounded-2xl bg-primary px-4 font-bold text-primary-foreground" data-testid="customize-preview">
              👀 {t("preview")}
            </Link>
          </li>
        </ol>
      </div>
    </section>
  );
}

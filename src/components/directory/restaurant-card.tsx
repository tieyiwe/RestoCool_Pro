import Link from "next/link";
import type { DirectoryEntry } from "@/lib/directory";

/** One restaurant in the directory (also used for the featured ones on the home page). */
export function RestaurantCard({ r, locale, cta, featuredLabel }: { r: DirectoryEntry; locale: string; cta: string; featuredLabel?: string }) {
  const desc = r.description[locale]?.trim() || r.description.fr;
  return (
    <Link href={`/r/${r.slug}`} className="group flex h-full flex-col gap-3 rounded-3xl border border-ligne bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" data-testid="directory-card">
      <span className="flex items-center gap-3">
        {r.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small logo
          <img src={r.logoUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 rounded-2xl border border-ligne object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white" style={{ background: r.accent }} aria-hidden>
            {r.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          {featuredLabel && <span className="mb-0.5 inline-block rounded-full bg-or/20 px-2 text-xs font-bold text-encre">★ {featuredLabel}</span>}
          <span className="font-display block truncate text-lg leading-tight font-extrabold">{r.name}</span>
          <span className="block text-sm text-encre-2">{r.city}</span>
          {/* Star rating from the customers' visible reviews. */}
          {r.rating != null && r.reviewCount > 0 && (
            <span className="mt-0.5 flex items-center gap-1 text-sm" data-testid="directory-rating" aria-label={`${r.rating.toFixed(1)}/5 (${r.reviewCount})`}>
              <span className="text-[#E9B530]" aria-hidden>
                {"★".repeat(Math.round(r.rating))}
                <span className="text-encre-2/30">{"★".repeat(5 - Math.round(r.rating))}</span>
              </span>
              <span className="font-bold tabular-nums" aria-hidden>
                {r.rating.toFixed(1)}
              </span>
              <span className="text-encre-2" aria-hidden>
                ({r.reviewCount})
              </span>
            </span>
          )}
        </span>
      </span>
      {desc && <span className="line-clamp-2 text-sm text-encre-2">{desc}</span>}
      <span className="mt-auto flex items-center justify-between gap-2 text-sm">
        {r.rc ? <span className="rounded-md bg-creme px-2 py-0.5 font-mono font-bold">{r.rc}</span> : <span />}
        <span className="font-bold text-vert group-hover:underline">{cta} →</span>
      </span>
    </Link>
  );
}

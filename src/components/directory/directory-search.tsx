"use client";

import { useEffect, useRef, useState } from "react";
import type { DirectoryEntry } from "@/lib/directory";
import { RestaurantCard } from "./restaurant-card";

type S = { label: string; placeholder: string; empty: string; cta: string; count: string; searching: string };

/**
 * Results narrow as you type (name, city or numéro RC). Works without JavaScript too: the form
 * submits ?q= and the server renders the same list.
 */
export function DirectorySearch({ initialQuery, initial, locale, s }: { initialQuery: string; initial: DirectoryEntry[]; locale: string; s: S }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState(initial);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = ++seq.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/public/restaurants?q=${encodeURIComponent(q)}`).catch(() => null);
      if (id !== seq.current) return; // a newer keystroke won
      setLoading(false);
      if (res?.ok) setResults(((await res.json()) as { results: DirectoryEntry[] }).results);
      const url = new URL(window.location.href);
      if (q.trim()) url.searchParams.set("q", q.trim());
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      <form action="/restaurants" method="get" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="dir-q" className="sr-only">
          {s.label}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl" aria-hidden>
            🔎
          </span>
          <input
            id="dir-q"
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={s.placeholder}
            autoComplete="off"
            className="min-h-14 w-full rounded-2xl border border-ligne bg-white pr-4 pl-12 text-lg shadow-sm outline-none focus:border-vert focus:ring-4 focus:ring-vert/15"
            data-testid="directory-input"
          />
        </div>
      </form>
      <p className="text-sm text-encre-2" role="status" aria-live="polite" data-testid="directory-count">
        {loading ? s.searching : s.count.replace("#", String(results.length))}
      </p>
      {results.length === 0 ? (
        <p className="rounded-3xl bg-white p-8 text-center text-encre-2">{s.empty}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <li key={r.slug}>
              <RestaurantCard r={r} locale={locale} cta={s.cta} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

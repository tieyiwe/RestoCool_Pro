"use client";

import { useEffect, useId, useRef, useState } from "react";
import { forgetPlace, readRecent, type RecentPlace } from "@/lib/public-menu/recent";

type Hit = { slug: string; name: string; city: string; logoUrl: string | null; rc: string | null };
type Labels = { label: string; placeholder: string; submit: string; suggestions: string; recent: string; remove: string; open: string };

const clean = (s: string) => {
  let x = s.toUpperCase().replace(/[\s\-_.#]/g, "");
  if (x.startsWith("RC")) x = x.slice(2);
  return x;
};

/**
 * Numéro RC field that suggests businesses while the code is typed (tap the right one without
 * typing the whole code), and the last businesses opened on this phone. Still a plain GET form
 * to /c without JavaScript.
 */
export function CodeTypeahead({ labels, defaultValue, error }: { labels: Labels; defaultValue?: string; error?: boolean }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const listId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    const q = clean(value);
    if (timer.current) clearTimeout(timer.current);
    if (!q || q.length > 5) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/public/restaurants?rc=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setHits(((await r.json()) as { results: Hit[] }).results);
      } catch {
        /* offline or aborted */
      }
    }, 150);
    return () => ctrl.abort();
  }, [value]);

  const q = clean(value);
  const open = hits.length > 0;
  const go = (h: Hit) => window.location.assign(`/r/${h.slug}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div className="flex flex-wrap gap-2">
          <input
            id="code-input"
            name="code"
            required
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (!open) return;
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(hits.length - 1, a + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(-1, a - 1)));
              if (e.key === "Enter" && active >= 0) (e.preventDefault(), go(hits[active]!));
              if (e.key === "Escape") setHits([]);
            }}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={labels.placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-error" : undefined}
            className="rc-code-input min-h-12 w-52 rounded-lg px-3 text-center font-mono text-xl font-bold tracking-[0.2em] uppercase"
            data-testid="code-input"
          />
          <button type="submit" className="min-h-12 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90">
            {labels.submit}
          </button>
        </div>
        {open && (
          <ul id={listId} role="listbox" aria-label={labels.suggestions} className="absolute top-full left-0 z-30 mt-1 w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface shadow-xl" data-testid="code-suggestions">
            {hits.map((h, i) => {
              const code = (h.rc ?? "").replace(/^RC-/, "");
              return (
                <li key={h.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-muted" : "hover:bg-muted"}`}>
                    {h.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.logoUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        🍽️
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{h.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {h.city ? `${h.city} · ` : ""}
                        <span className="font-mono">
                          RC-<b className="text-foreground">{code.slice(0, q.length)}</b>
                          {code.slice(q.length)}
                        </span>
                      </span>
                    </span>
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {recent.length > 0 && (
        <div data-testid="recent-places">
          <p className="mb-1.5 text-sm font-semibold">🕘 {labels.recent}</p>
          <ul className="flex flex-wrap gap-2">
            {recent.map((p) => (
              <li key={p.slug} className="flex items-center overflow-hidden rounded-full border border-border bg-surface">
                <a href={`/r/${p.slug}`} className="flex min-h-11 items-center gap-2 pr-1 pl-3 text-sm font-semibold" title={`${labels.open} ${p.name}`}>
                  {p.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo} alt="" width={24} height={24} className="size-6 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden>🍽️</span>
                  )}
                  <span className="max-w-40 truncate">{p.name}</span>
                </a>
                <button type="button" onClick={() => setRecent(forgetPlace(p.slug))} aria-label={`${labels.remove} ${p.name}`} className="flex size-11 items-center justify-center text-muted-foreground hover:text-foreground">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

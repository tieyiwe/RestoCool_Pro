"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NavItem } from "./side-nav";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Desktop shortcut: Ctrl+K / ⌘K opens « Aller à… » to jump to any section by typing a few letters
 * (arrows + Entrée). Also opened by the search button in the top bar.
 */
export function CommandPalette({ items, labels }: { items: NavItem[]; labels: { open: string; placeholder: string; empty: string; hint: string } }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const found = useMemo(() => items.filter((n) => fold(n.label).includes(fold(q.trim()))), [items, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQ("");
        setI(0);
        dialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (n: NavItem | undefined) => {
    if (!n) return;
    dialog.current?.close();
    router.push(n.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQ("");
          setI(0);
          dialog.current?.showModal();
        }}
        className="hidden min-h-10 w-72 items-center gap-2 rounded-xl border border-border bg-background/60 px-3 text-sm text-muted-foreground hover:bg-muted lg:flex"
        data-testid="command-open"
      >
        <span aria-hidden>🔎</span>
        <span className="flex-1 text-left">{labels.open}</span>
        <kbd className="rounded border border-border bg-surface px-1.5 font-mono text-[11px]">Ctrl K</kbd>
      </button>
      <dialog ref={dialog} className="mx-auto mt-[12vh] w-[min(92vw,36rem)] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/40" aria-label={labels.open} data-testid="command-palette">
        <div className="flex flex-col">
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setI((x) => Math.min(found.length - 1, x + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
              if (e.key === "Enter") (e.preventDefault(), go(found[i]));
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className="min-h-14 border-b border-border bg-transparent px-4 text-base outline-none"
          />
          <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {found.length === 0 && <li className="p-3 text-sm text-muted-foreground">{labels.empty}</li>}
            {found.map((n, k) => (
              <li key={n.href} role="option" aria-selected={k === i}>
                <button type="button" onMouseEnter={() => setI(k)} onClick={() => go(n)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${k === i ? "bg-primary text-primary-foreground" : ""}`}>
                  <span aria-hidden className="w-5 text-center">
                    {n.icon}
                  </span>
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{labels.hint}</p>
        </div>
      </dialog>
    </>
  );
}

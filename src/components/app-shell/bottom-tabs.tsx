"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Tab = { href: string; label: string; icon: string };

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`));

/**
 * Phone navigation like a native app: up to 4 main tabs + « Plus » (everything else) at the
 * bottom, within thumb reach, above the iPhone home bar. Hidden from tablets up.
 */
export function BottomTabs({ tabs, more, moreLabel, closeLabel }: { tabs: Tab[]; more: Tab[]; moreLabel: string; closeLabel: string }) {
  const path = usePathname() ?? "/app";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    // The phone's back button closes the sheet instead of leaving the page.
    history.pushState({ rcSheet: 1 }, "");
    const onPop = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && history.back();
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const moreActive = more.some((m) => isActive(path, m.href));
  const item = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold leading-none";

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" role="dialog" aria-modal="true" aria-label={moreLabel}>
          <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-black/40" onClick={() => history.back()} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
            <ul className="grid grid-cols-3 gap-2" data-testid="more-sheet">
              {more.map((m) => (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    className={cn("flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-border p-2 text-center text-xs font-semibold", isActive(path, m.href) && "border-primary bg-primary/10 text-primary")}
                  >
                    <span className="text-2xl" aria-hidden>
                      {m.icon}
                    </span>
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <nav
        aria-label={moreLabel}
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
        data-testid="bottom-tabs"
      >
        {tabs.map((tab) => {
          const active = isActive(path, tab.href);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={cn(item, active ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("flex h-8 w-14 items-center justify-center rounded-full text-xl transition-colors", active && "bg-primary/15")} aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
        {more.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(item, open || moreActive ? "text-primary" : "text-muted-foreground")} data-testid="more-tab">
            <span className={cn("flex h-8 w-14 items-center justify-center rounded-full text-xl", (open || moreActive) && "bg-primary/15")} aria-hidden>
              ☰
            </span>
            {moreLabel}
          </button>
        )}
      </nav>
    </>
  );
}

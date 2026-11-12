"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ConsoleNavGroup = { label: string; items: Array<{ href: string; label: string; icon: string; badge?: number; key: string }> };

const isActive = (path: string, href: string) => (href === "/admin_pro" ? path === "/admin_pro" : path === href || path.startsWith(`${href}/`));

/**
 * Console navigation: grouped in the dark indigo sidebar from tablets up; on phones the same
 * links as a row you swipe under the top bar (the current page stays highlighted).
 */
export function ConsoleNav({ groups, label }: { groups: ConsoleNavGroup[]; label: string }) {
  const path = usePathname() ?? "/admin_pro";
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:flex-col md:gap-5 md:overflow-visible md:px-0 md:pb-0" data-testid="admin-nav">
      {groups.map((g) => (
        <div key={g.label} className="contents md:flex md:flex-col md:gap-0.5">
          <p className="hidden px-3 pb-1 text-[10px] font-bold tracking-[0.14em] uppercase opacity-50 md:block">{g.label}</p>
          {g.items.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition-colors md:gap-3 ${active ? "bg-white/15 text-white md:shadow-[inset_3px_0_0_var(--console-amber)]" : "text-[var(--console-side-fg)]/80 hover:bg-white/8 hover:text-white"}`}
              >
                <span aria-hidden className="w-5 text-center">
                  {n.icon}
                </span>
                <span className="md:flex-1 md:truncate">{n.label}</span>
                {n.badge ? (
                  <span className="rounded-full bg-[var(--console-amber)] px-2 text-xs font-extrabold text-[#15123a]" data-testid={`admin-badge-${n.key}`}>
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

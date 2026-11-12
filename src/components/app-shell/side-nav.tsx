"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: string; badge?: number };
export type NavGroup = { label: string; items: NavItem[] };

const isActive = (path: string, href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`));

/** Desktop/tablet sidebar: grouped sections, the current one highlighted. */
export function SideNav({ groups, label }: { groups: NavGroup[]; label: string }) {
  const path = usePathname() ?? "/app";
  return (
    <nav aria-label={label} className="flex flex-col gap-5" data-testid="side-nav">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{g.label}</p>
          {g.items.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/85 hover:bg-muted hover:text-foreground",
                )}
              >
                <span aria-hidden className="w-5 text-center text-base">
                  {n.icon}
                </span>
                <span className="flex-1 truncate">{n.label}</span>
                {n.badge ? <span className={cn("rounded-full px-1.5 text-[11px] font-bold", active ? "bg-primary-foreground text-primary" : "bg-red-600 text-white")}>{n.badge}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

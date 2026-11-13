"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConsoleNavGroup = { label: string; items: Array<{ href: string; label: string; icon: string; badge?: number; key: string }> };

const isActive = (path: string, href: string) => (href === "/admin_pro" ? path === "/admin_pro" : path === href || path.startsWith(`${href}/`));

/** The four screens a phone gets as tabs (when the person may open them); everything else is under « Menu ». */
const TAB_HREFS = ["/admin_pro", "/admin_pro/live", "/admin_pro/businesses", "/admin_pro/support"];

/**
 * Console navigation. Tablets and up: grouped list in the dark indigo sidebar. Phones: native-style
 * bottom tabs (overview, live, businesses, support) + « Menu », a full-screen sheet with every page
 * by group, the business search and the person's account (closes with the back button).
 */
export function ConsoleNav({
  groups,
  label,
  mobile,
}: {
  groups: ConsoleNavGroup[];
  label: string;
  mobile: {
    menu: string;
    close: string;
    search: string;
    person: { name: string; email: string; role: string };
    links: Array<{ href: string; label: string; newTab?: boolean }>;
  };
}) {
  const path = usePathname() ?? "/admin_pro";
  const all = groups.flatMap((g) => g.items);
  const tabs = TAB_HREFS.map((h) => all.find((n) => n.href === h)).filter((n): n is NonNullable<typeof n> => Boolean(n));
  const inTabs = tabs.some((n) => isActive(path, n.href));
  // Badges of pages that are only in the menu show on the « Menu » tab.
  const hiddenBadges = all.filter((n) => !tabs.includes(n)).reduce((s, n) => s + (n.badge ?? 0), 0);

  return (
    <>
      <nav aria-label={label} className="hidden md:flex md:flex-col md:gap-5" data-testid="admin-nav">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[10px] font-bold tracking-[0.14em] uppercase opacity-50">{g.label}</p>
            {g.items.map((n) => (
              <NavLink key={n.href} n={n} active={isActive(path, n.href)} />
            ))}
          </div>
        ))}
      </nav>
      <MobileConsoleNav groups={groups} tabs={tabs} inTabs={inTabs} hiddenBadges={hiddenBadges} path={path} label={label} mobile={mobile} />
    </>
  );
}

function NavLink({ n, active, onClick, big = false }: { n: ConsoleNavGroup["items"][number]; active: boolean; onClick?: () => void; big?: boolean }) {
  return (
    <Link
      href={n.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-3 rounded-xl px-3 font-semibold whitespace-nowrap transition-colors ${big ? "min-h-12 text-base" : "min-h-10 text-sm"} ${active ? "bg-white/15 text-white md:shadow-[inset_3px_0_0_var(--console-amber)]" : "text-[var(--console-side-fg)]/85 hover:bg-white/8 hover:text-white"}`}
    >
      <span aria-hidden className="w-5 text-center">
        {n.icon}
      </span>
      <span className="flex-1 truncate">{n.label}</span>
      {n.badge ? (
        <span className="rounded-full bg-[var(--console-amber)] px-2 text-xs font-extrabold text-[#15123a]" data-testid={`admin-badge-${n.key}`}>
          {n.badge}
        </span>
      ) : null}
    </Link>
  );
}

function MobileConsoleNav({
  groups,
  tabs,
  inTabs,
  hiddenBadges,
  path,
  label,
  mobile,
}: {
  groups: ConsoleNavGroup[];
  tabs: ConsoleNavGroup["items"];
  inTabs: boolean;
  hiddenBadges: number;
  path: string;
  label: string;
  mobile: Parameters<typeof ConsoleNav>[0]["mobile"];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pushed = useRef(false);
  const close = useCallback(() => {
    setOpen(false);
    if (pushed.current) {
      pushed.current = false;
      history.back();
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    history.pushState({ rcConsoleMenu: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);
  const follow = () => {
    pushed.current = false;
    setOpen(false);
  };

  return (
    <div className="md:hidden">
      {/* Bottom tabs, always within thumb reach. */}
      <nav
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-white/10 bg-[var(--console-side)] text-[var(--console-side-fg)]"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="admin-tabs"
      >
        {tabs.map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${active ? "text-white" : "opacity-70"}`}>
              {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--console-amber)]" aria-hidden />}
              <span aria-hidden className="text-lg leading-none">
                {n.icon}
              </span>
              <span className="max-w-full truncate">{n.label}</span>
              {n.badge ? <span className="absolute top-1.5 right-[calc(50%-1.4rem)] rounded-full bg-[var(--console-amber)] px-1.5 text-[10px] font-extrabold text-[#15123a]">{n.badge}</span> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${!inTabs ? "text-white" : "opacity-70"}`} data-testid="admin-menu-button">
          {!inTabs && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--console-amber)]" aria-hidden />}
          <span aria-hidden className="text-lg leading-none">
            ☰
          </span>
          <span>{mobile.menu}</span>
          {hiddenBadges > 0 && <span className="absolute top-1.5 right-[calc(50%-1.4rem)] rounded-full bg-[var(--console-amber)] px-1.5 text-[10px] font-extrabold text-[#15123a]">{hiddenBadges}</span>}
        </button>
      </nav>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={mobile.menu} className="fixed inset-0 z-50 flex flex-col bg-[linear-gradient(180deg,var(--console-side),var(--console-side-2))] text-[var(--console-side-fg)]" data-testid="admin-menu">
          <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <div className="min-w-0">
              <p className="truncate font-bold text-white">{mobile.person.name}</p>
              <p className="truncate text-xs opacity-70">{mobile.person.email}</p>
              <p className="mt-1 inline-block rounded-full bg-[var(--console-amber)]/90 px-2 py-0.5 text-[11px] font-bold text-[#15123a]">{mobile.person.role}</p>
            </div>
            <button type="button" onClick={close} aria-label={mobile.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl leading-none text-white" data-testid="admin-menu-close">
              ×
            </button>
          </div>
          <form
            action="/admin_pro/businesses"
            role="search"
            className="px-4 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
              follow();
              router.push(q ? `/admin_pro/businesses?q=${encodeURIComponent(q)}` : "/admin_pro/businesses");
            }}
          >
            <label className="sr-only" htmlFor="console-search-mobile">
              {mobile.search}
            </label>
            <input id="console-search-mobile" name="q" type="search" placeholder={`🔎 ${mobile.search}`} className="min-h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/60" />
          </form>
          <nav aria-label={label} className="flex-1 overflow-y-auto px-3 pb-4">
            {groups.map((g) => (
              <div key={g.label} className="mb-4 flex flex-col gap-0.5">
                <p className="px-3 pb-1 text-[11px] font-bold tracking-[0.14em] uppercase opacity-60">{g.label}</p>
                {g.items.map((n) => (
                  <NavLink key={n.href} n={n} active={isActive(path, n.href)} onClick={follow} big />
                ))}
              </div>
            ))}
            <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-3">
              {mobile.links.map((l) => (
                <a key={l.href} href={l.href} target={l.newTab ? "_blank" : undefined} rel={l.newTab ? "noopener" : undefined} onClick={follow} className="flex min-h-12 items-center rounded-xl px-3 text-base font-semibold text-white/85 hover:bg-white/8">
                  ↗ {l.label}
                </a>
              ))}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

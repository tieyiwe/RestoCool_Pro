"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MobileMenuLink = { href: string; label: string; icon: string };

/**
 * Phones and tablets (below the desktop menu): a « Menu » button that opens a full-screen panel
 * with every link of the page, the language switch, sign-in and the sign-up button. Closes on a
 * link, on Escape and with the phone's back button; the page behind does not scroll.
 */
export function MobileMenu({
  links,
  signIn,
  cta,
  labels,
  children,
}: {
  links: MobileMenuLink[];
  signIn: { href: string; label: string };
  cta: { href: string; label: string };
  labels: { open: string; close: string; title: string };
  /** Language switch (server form). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    // The panel added a history step: going back removes it without leaving the page.
    if (pushed.current) {
      pushed.current = false;
      history.back();
    }
    button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    history.pushState({ rcMenu: true }, "");
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
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  // Following a link: close without stepping back (the link navigates or scrolls itself).
  const follow = () => {
    pushed.current = false;
    setOpen(false);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="rc-mobile-menu"
        aria-label={labels.open}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ligne bg-creme text-encre xl:hidden"
        data-testid="mobile-menu-button"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {/* Rendered on <body>: the sticky header's backdrop blur would otherwise trap a fixed panel inside it. */}
      {open &&
        createPortal(
        <div id="rc-mobile-menu" ref={panel} role="dialog" aria-modal="true" aria-label={labels.title} className="fixed inset-0 z-50 flex flex-col bg-creme text-encre xl:hidden" data-testid="mobile-menu">
          <div className="flex h-16 items-center justify-between border-b border-ligne/70 px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <p className="font-display text-lg font-extrabold">{labels.title}</p>
            <button type="button" onClick={close} aria-label={labels.close} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ligne text-2xl leading-none" data-testid="mobile-menu-close">
              ×
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 py-3" aria-label={labels.title}>
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={follow} className="flex min-h-14 items-center gap-3 border-b border-ligne/60 text-lg font-semibold">
                    <span aria-hidden className="w-7 text-center text-xl">
                      {l.icon}
                    </span>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            {children && <div className="mt-5 flex justify-center">{children}</div>}
          </nav>
          <div className="flex flex-col gap-2 border-t border-ligne/70 p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <Link href={cta.href} onClick={follow} className="flex min-h-12 items-center justify-center rounded-xl bg-vert px-4 text-base font-bold text-creme">
              {cta.label}
            </Link>
            <Link href={signIn.href} onClick={follow} className="flex min-h-12 items-center justify-center rounded-xl border border-ligne px-4 text-base font-semibold">
              {signIn.label}
            </Link>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

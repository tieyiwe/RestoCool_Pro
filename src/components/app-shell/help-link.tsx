"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** « Aide / signaler un problème », from any screen: the screen is passed along with the request. */
export function HelpLink({ label, variant = "icon" }: { label: string; variant?: "icon" | "button" }) {
  const path = usePathname() ?? "/app";
  const href = path.startsWith("/app/support") ? "/app/support" : `/app/support?from=${encodeURIComponent(path)}`;
  if (variant === "button")
    return (
      <Link href={href} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted" data-testid="help-button">
        <span aria-hidden>🛟</span>
        {label}
      </Link>
    );
  return (
    <Link href={href} aria-label={label} title={label} className="inline-flex size-11 items-center justify-center rounded-full text-xl hover:bg-muted" data-testid="help-link">
      <span aria-hidden>🛟</span>
    </Link>
  );
}

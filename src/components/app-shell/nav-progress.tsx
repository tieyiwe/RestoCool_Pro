"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin progress bar at the top while the next staff screen loads, so a tap always shows a
 * reaction on slow networks. (No loading.tsx: pages must keep their real 404 status.)
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [path, search]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setBusy(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  // Never stays stuck (e.g. a link that ends in an error page on the same address).
  useEffect(() => {
    if (!busy) return;
    const id = setTimeout(() => setBusy(false), 12_000);
    return () => clearTimeout(id);
  }, [busy]);
  if (!busy) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-primary/20 print:hidden" role="progressbar" aria-label="…" aria-busy="true">
      <div className="h-full w-1/3 animate-[rc-progress_1s_ease-in-out_infinite] bg-primary motion-reduce:animate-none" />
    </div>
  );
}

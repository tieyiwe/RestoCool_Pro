"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Refreshes a console page every `every` ms while it is visible, and shows when it last did. */
export function AutoRefresh({ every = 30_000, label }: { every?: number; label: string }) {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    }, every);
    return () => clearInterval(id);
  }, [router, every]);
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900" data-testid="admin-auto-refresh">
      <span className="size-2 animate-pulse rounded-full bg-emerald-600 motion-reduce:animate-none" aria-hidden />
      {label} · {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

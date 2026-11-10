"use client";

import { ClerkFailed, ClerkLoading } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * While Clerk loads: a quiet placeholder the size of the sign-in card (no text flash).
 * Words appear only if it takes unusually long (slow network), so nobody is left guessing.
 */
function LoadingCard({ slowText }: { slowText: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div role="status" aria-busy="true" className="flex w-full max-w-[25rem] flex-col items-center gap-3" data-testid="auth-loading">
      <div className="w-full rounded-2xl border border-border bg-white/80 p-6 shadow-sm motion-safe:animate-pulse" aria-hidden>
        <div className="mx-auto mb-6 h-5 w-2/3 rounded bg-muted" />
        <div className="mb-3 h-11 rounded-lg bg-muted" />
        <div className="mb-6 h-11 rounded-lg bg-muted" />
        <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
        <div className="mb-4 h-11 rounded-lg bg-muted" />
        <div className="h-11 rounded-lg bg-primary/30" />
      </div>
      <p className={slow ? "text-sm text-muted-foreground" : "sr-only"}>{slowText}</p>
    </div>
  );
}

/** Never leave a blank page: say when sign-in is loading, and what to do if it cannot load. */
export function ClerkStatus({ diag }: { diag?: { mode: string; host: string; proxy: boolean } }) {
  const t = useTranslations("common");
  return (
    <>
      <ClerkLoading>
        <LoadingCard slowText={t("authLoadingSlow")} />
      </ClerkLoading>
      <ClerkFailed>
        <p role="alert" className="max-w-sm rounded-lg bg-red-50 p-3 text-center text-sm text-red-900">
          {t("authFailed")}
          {diag && (
            <span className="mt-2 block font-mono text-[11px] text-red-900/70" data-testid="clerk-diag">
              clerk: {diag.mode} · {diag.host || "?"}
              {diag.proxy ? " · proxy" : ""}
            </span>
          )}
        </p>
      </ClerkFailed>
    </>
  );
}

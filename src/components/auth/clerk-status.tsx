"use client";

import { ClerkFailed, ClerkLoading } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

/** Never leave a blank page: say when sign-in is loading, and what to do if it cannot load. */
export function ClerkStatus({ diag }: { diag?: { mode: string; host: string; proxy: boolean } }) {
  const t = useTranslations("common");
  return (
    <>
      <ClerkLoading>
        <p role="status" className="text-sm text-muted-foreground">
          {t("authLoading")}
        </p>
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

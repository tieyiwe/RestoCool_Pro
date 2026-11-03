"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import type { SettingsResult } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";

/**
 * Wraps one settings section: submits to a server action, shows the result,
 * and in the wizard moves on to `next` after a successful save.
 */
export function SettingsForm({
  action,
  submitLabel,
  next,
  testId,
  children,
}: {
  action: (prev: SettingsResult, fd: FormData) => Promise<SettingsResult>;
  submitLabel?: string;
  next?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok && next) router.push(next);
  }, [state, next, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid={testId}>
      {children}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {t(`errors.${state.error ?? "unknown"}`)}
        </p>
      )}
      {state?.ok && !next && (
        <p role="status" className="text-sm font-semibold text-vert">
          ✓ {t("saved")}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : (submitLabel ?? t("save"))}
        </Button>
      </div>
    </form>
  );
}

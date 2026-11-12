import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { DELETION_DELAY_HOURS, RESTORE_DAYS, currentDeletion } from "@/lib/restaurants/deletion";
import { cancelDeletionAction, requestDeletionAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("danger"))("title") };
}

const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Ouagadougou" }).format(d);

/** Danger zone: asking to delete the business (owner only, with a written reason and the name typed). */
export default async function DangerZone({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("settings.write");
  const [t, sp] = await Promise.all([getTranslations("danger"), searchParams]);
  const r = (await ctx.repo.restaurant.get())!;
  const owner = ctx.actor.role === "owner" && ctx.actor.via !== "pin";
  const cur = await currentDeletion(getDb(), r.id);
  const field = "min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5" data-testid="danger-zone">
      <Link href="/app/settings" className="text-sm font-semibold text-primary">
        ← {t("back")}
      </Link>
      <div className="rounded-3xl border-2 border-red-600 bg-red-50 p-5 text-red-950 dark:bg-red-950/30 dark:text-red-100">
        <h1 className="text-2xl font-extrabold">⚠️ {t("title")}</h1>
        <p className="mt-1">{t("intro", { name: r.name })}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-900" data-testid="danger-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.requested")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-900" data-testid="danger-error">
          {t(`errors.${sp.error}` as "errors.reason")}
        </p>
      )}

      {!owner ? (
        <p className="rounded-2xl bg-muted p-4">{t("ownerOnly")}</p>
      ) : cur && (cur.status === "pending" || cur.status === "confirmed") ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="deletion-pending">
          <p className="text-lg font-bold">{t("pendingTitle")}</p>
          <p>{t("pendingText", { date: fmt(cur.effectiveAt), days: RESTORE_DAYS })}</p>
          <p className="text-sm text-muted-foreground">{cur.status === "confirmed" ? t("statusConfirmed") : t("statusPending")}</p>
          <form action={cancelDeletionAction}>
            <button className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="deletion-cancel">
              {t("cancel")}
            </button>
          </form>
        </section>
      ) : (
        <form action={requestDeletionAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" data-testid="deletion-form">
          <div className="text-sm">
            <p className="font-bold">{t("whatHappens")}</p>
            <ul className="mt-1 list-disc pl-5">
              <li>{t("step1", { hours: DELETION_DELAY_HOURS })}</li>
              <li>{t("step2")}</li>
              <li>{t("step3")}</li>
              <li>{t("step4", { days: RESTORE_DAYS })}</li>
              <li>{t("step5")}</li>
            </ul>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("reason")}</span>
            <textarea name="reason" required minLength={60} maxLength={2000} rows={5} placeholder={t("reasonPlaceholder")} className={`${field} py-2`} data-testid="deletion-reason" />
            <span className="mt-1 block text-xs text-muted-foreground">{t("reasonHint")}</span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("typeName", { name: r.name })}</span>
            <input name="confirmName" required autoComplete="off" spellCheck={false} className={field} data-testid="deletion-name" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="understood" required className="mt-1 size-5" data-testid="deletion-understood" />
            <span>{t("understood", { hours: DELETION_DELAY_HOURS, days: RESTORE_DAYS })}</span>
          </label>
          <button className="min-h-12 rounded-xl bg-red-700 px-5 font-bold text-white" data-testid="deletion-submit">
            {t("submit")}
          </button>
        </form>
      )}
    </div>
  );
}

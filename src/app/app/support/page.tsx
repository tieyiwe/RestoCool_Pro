import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { CATEGORIES, URGENCIES, listBusinessRequests, markBusinessRead } from "@/lib/support/requests";
import { createSupportRequestAction, replySupportRequestAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("support"))("title") };
}

const field = "min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base";
const URGENCY_STYLE = {
  low: "peer-checked:border-sky-500 peer-checked:bg-sky-50 dark:peer-checked:bg-sky-950/30",
  medium: "peer-checked:border-amber-500 peer-checked:bg-amber-50 dark:peer-checked:bg-amber-950/30",
  high: "peer-checked:border-red-600 peer-checked:bg-red-50 dark:peer-checked:bg-red-950/30",
} as const;
const URGENCY_ICON = { low: "🟢", medium: "🟠", high: "🔴" } as const;
const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-100 text-sky-900",
  in_progress: "bg-amber-100 text-amber-900",
  waiting: "bg-violet-100 text-violet-900",
  resolved: "bg-emerald-100 text-emerald-900",
};

/** « Signaler un problème »: send a request to the RestoCool team and follow the answers. */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ from?: string; sent?: string; replied?: string; error?: string }> }) {
  const ctx = await requireMemberPage("restaurant.read", { duringSetup: true });
  const [t, format, sp] = await Promise.all([getTranslations("support"), getFormatter(), searchParams]);
  const lead = ctx.actor.role === "owner" || ctx.actor.role === "manager";
  const db = getDb();
  const list = await listBusinessRequests(db, ctx.repo.restaurantId, lead ? null : (ctx.actor.memberId ?? "none"));
  // Opening the page reads the answers.
  await markBusinessRead(db, ctx.repo.restaurantId, list.filter((r) => r.unreadForBusiness).map((r) => r.id));
  const from = sp.from && sp.from.startsWith("/app") ? sp.from.slice(0, 300) : "";
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6" data-testid="support-page">
      <div>
        <h1 className="text-2xl font-extrabold">🛟 {t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {sp.sent && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-900" data-testid="support-sent">
          ✓ {t("sent", { ref: `D-${sp.sent.padStart(6, "0")}` })}
        </p>
      )}
      {sp.replied && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
          ✓ {t("replied")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">
          {sp.error === "tooMany" ? t("tooMany") : t("invalid")}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <CardTitle>{t("formTitle")}</CardTitle>
        <form action={createSupportRequestAction} className="flex flex-col gap-4" data-testid="support-form">
          <input type="hidden" name="from" value={from} />
          <fieldset>
            <legend className="mb-2 font-semibold">{t("urgency")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {URGENCIES.map((u) => (
                <label key={u} className="relative cursor-pointer">
                  <input type="radio" name="urgency" value={u} required defaultChecked={u === "medium"} className="peer sr-only" data-testid={`urgency-${u}`} />
                  <span className={`flex min-h-20 flex-col gap-1 rounded-xl border-2 border-border p-3 peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${URGENCY_STYLE[u]}`}>
                    <span className="font-bold">
                      {URGENCY_ICON[u]} {t(`urgencies.${u}`)}
                    </span>
                    <span className="text-xs text-muted-foreground">{t(`urgencyHints.${u}`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("category")}</span>
              <select name="category" defaultValue="bug" className={field} data-testid="support-category">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("contact")}</span>
              <input name="contact" maxLength={120} placeholder={t("contactPlaceholder")} className={field} />
            </label>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("subject")}</span>
            <input name="subject" required maxLength={140} placeholder={t("subjectPlaceholder")} className={field} data-testid="support-subject" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("body")}</span>
            <textarea name="body" required maxLength={4000} rows={5} placeholder={t("bodyPlaceholder")} className={`${field} py-2`} data-testid="support-body" />
          </label>
          {from && <p className="text-xs text-muted-foreground">{t("fromPage", { page: from })}</p>}
          <button className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground sm:self-start" data-testid="support-submit">
            {t("submit")}
          </button>
          <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        </form>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="mine">
        <h2 id="mine" className="text-lg font-bold">
          {lead ? t("allTitle") : t("mineTitle")}
        </h2>
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
        {list.map((r) => (
          <Card key={r.id} id={`r-${r.id}`} className="flex scroll-mt-24 flex-col gap-3" data-testid="support-request">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">
                  {URGENCY_ICON[r.urgency as "low"]} {r.subject}
                  {r.unreadForBusiness && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{t("newAnswer")}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{r.ref}</span> · {t(`categories.${r.category as "bug"}`)} · {r.name} · {format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[r.status] ?? "bg-muted"}`} data-testid="support-status">
                {t(`statuses.${r.status as "new"}`)}
              </span>
            </div>
            <ol className="flex flex-col gap-2">
              {r.messages.map((m) => (
                <li key={m.id} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.from === "admin" ? "self-start bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50" : "self-end bg-muted"}`}>
                  <p className="text-xs font-semibold opacity-70">
                    {m.author} · {format.dateTime(m.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ol>
            <form action={replySupportRequestAction} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="id" value={r.id} />
              <label className="sr-only" htmlFor={`reply-${r.id}`}>
                {t("reply")}
              </label>
              <textarea id={`reply-${r.id}`} name="body" required maxLength={4000} rows={1} placeholder={t("replyPlaceholder")} className={`${field} flex-1 py-2`} />
              <button className="min-h-12 rounded-xl border border-border bg-surface px-4 font-bold">{t("reply")}</button>
            </form>
          </Card>
        ))}
      </section>
    </div>
  );
}

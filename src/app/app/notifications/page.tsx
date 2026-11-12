import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { markMessagesRead, messagesFor } from "@/lib/platform/messages";
import { unreadForBusiness } from "@/lib/support/requests";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notifications"))("title") };
}

const KIND_ICON: Record<string, string> = { feature: "✨", news: "📰", maintenance: "🛠️", billing: "💳", message: "✉️" };

/** Messages from the RestoCool team (new features, news, maintenance…) and answers to requests. */
export default async function NotificationsPage() {
  const ctx = await requireMemberPage("restaurant.read", { duringSetup: true });
  const [t, format, locale] = await Promise.all([getTranslations("notifications"), getFormatter(), getLocale()]);
  const db = getDb();
  const memberId = ctx.actor.memberId;
  const lead = ctx.actor.role === "owner" || ctx.actor.role === "manager";
  const v = memberId ? { memberId, restaurantId: ctx.repo.restaurantId, role: ctx.actor.role } : null;
  const [list, support] = await Promise.all([v ? messagesFor(db, v) : Promise.resolve([]), unreadForBusiness(db, ctx.repo.restaurantId, lead ? null : (memberId ?? "none"))]);
  // Opening the page reads them (the « new » marks stay for this visit).
  if (v) await markMessagesRead(db, v, list.filter((m) => !m.read).map((m) => m.id));
  const pick = (x: Record<string, string | undefined>) => x[locale] || x.fr || "";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5" data-testid="notifications-page">
      <div>
        <h1 className="text-2xl font-extrabold">🔔 {t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {support > 0 && (
        <Link href="/app/support" className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-950" data-testid="notifications-support">
          🛟 {t("supportAnswers", { n: support })}
          <span aria-hidden>→</span>
        </Link>
      )}
      {list.length === 0 && support === 0 && <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted-foreground">{t("none")}</p>}
      <ul className="flex flex-col gap-3">
        {list.map((m) => (
          <li key={m.id} className={`rounded-2xl border bg-surface p-4 ${m.read ? "border-border" : "border-primary shadow-sm"}`} data-testid="notification-item">
            <p className="text-xs font-semibold text-muted-foreground">
              {KIND_ICON[m.kind]} {t(`kinds.${m.kind as "feature"}`)} · {format.dateTime(m.createdAt, { dateStyle: "medium" })}
              {!m.read && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground">{t("new")}</span>}
            </p>
            <h2 className="mt-1 text-lg font-bold">{pick(m.title)}</h2>
            <p className="mt-1 whitespace-pre-wrap">{pick(m.body)}</p>
            {m.link && (
              <a href={m.link} className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline" {...(m.link.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>
                {t("open")} →
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

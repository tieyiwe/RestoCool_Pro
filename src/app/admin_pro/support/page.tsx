import Link from "next/link";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { STATUS_CHIP, URGENCY_CHIP } from "@/components/admin/support-chips";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { requireSuperadminPage } from "@/lib/auth/context";
import { STATUSES, URGENCIES, adminInbox, inboxCounts, type InboxFilter } from "@/lib/support/requests";

export const dynamic = "force-dynamic";

const field = "min-h-11 rounded-lg border border-border bg-surface px-3 text-base";

/** Requests from businesses: urgent first, then the oldest waiting. */
export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string; urgency?: string; q?: string }> }) {
  await requireSuperadminPage("support");
  const sp = await searchParams;
  const f: InboxFilter = {
    status: sp.status === "all" || (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as InboxFilter["status"]) : "open",
    urgency: (URGENCIES as readonly string[]).includes(sp.urgency ?? "") ? (sp.urgency as InboxFilter["urgency"]) : undefined,
    q: sp.q?.slice(0, 80),
  };
  const [{ t, format }, list, counts] = await Promise.all([adminI18n(), adminInbox(getDb(), f), inboxCounts(getDb())]);
  return (
    <div className="flex flex-col gap-5" data-testid="admin-support">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("support.title")}</h1>
          <p className="text-muted-foreground">{t("support.intro", { open: counts.open, fresh: counts.fresh, urgent: counts.urgent })}</p>
        </div>
        <AutoRefresh every={30_000} label={t("live.updated")} />
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t("support.search")} className={`${field} min-w-56 flex-1`} aria-label={t("support.search")} />
        <select name="status" defaultValue={f.status} className={field} aria-label={t("support.status")}>
          <option value="open">{t("support.statusOpen")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`support.statuses.${s}`)}
            </option>
          ))}
          <option value="all">{t("support.statusAll")}</option>
        </select>
        <select name="urgency" defaultValue={f.urgency ?? ""} className={field} aria-label={t("support.urgency")}>
          <option value="">{t("support.urgencyAll")}</option>
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {t(`support.urgencies.${u}`)}
            </option>
          ))}
        </select>
        <button className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground">{t("support.filter")}</button>
      </form>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted-foreground">{t("support.none")}</p>
      ) : (
        <>
        {/* Phones: one card per request, urgency and status first. */}
        <ul className="flex flex-col gap-2 md:hidden" data-testid="admin-support-cards">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/admin_pro/support/${r.id}`} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-3 active:bg-muted" data-testid="admin-support-card">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${URGENCY_CHIP[r.urgency as "low"] ?? ""}`}>{t(`support.urgencies.${r.urgency as "low"}`)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CHIP[r.status] ?? ""}`}>{t(`support.statuses.${r.status as "new"}`)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{format.relativeTime(r.createdAt)}</span>
                </div>
                <p className="font-semibold text-primary">{r.subject}</p>
                <p className="text-sm">
                  {r.business ?? <span className="text-amber-700">{t("support.noMatch", { rc: r.rcCode ?? "—" })}</span>}
                  {r.city && <span className="text-muted-foreground"> · {r.city}</span>}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {r.ref} · {t(`support.categories.${r.category as "bug"}`)} · {r.name}
                  {r.assignedTo ? ` → ${r.assignedTo.split("@")[0]}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
          <table className="w-full min-w-[820px] text-sm" data-testid="admin-support-list">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">{t("support.cols.urgency")}</th>
                <th className="p-3">{t("support.cols.request")}</th>
                <th className="p-3">{t("support.cols.business")}</th>
                <th className="p-3">{t("support.cols.from")}</th>
                <th className="p-3">{t("support.cols.received")}</th>
                <th className="p-3">{t("support.cols.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${URGENCY_CHIP[r.urgency as "low"] ?? ""}`}>{t(`support.urgencies.${r.urgency as "low"}`)}</span>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin_pro/support/${r.id}`} className="font-semibold text-primary">
                      {r.subject}
                    </Link>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {r.ref} · {t(`support.categories.${r.category as "bug"}`)}
                      {r.source === "public" ? ` · ${t("support.public")}` : ""}
                    </span>
                  </td>
                  <td className="p-3">
                    {r.business ?? <span className="text-amber-700">{t("support.noMatch", { rc: r.rcCode ?? "—" })}</span>}
                    {r.city && <span className="block text-xs text-muted-foreground">{r.city}</span>}
                  </td>
                  <td className="p-3">
                    {r.name}
                    <span className="block text-xs text-muted-foreground">{r.role ? t(`roles.${r.role as "owner"}`) : ""}</span>
                  </td>
                  <td className="p-3 text-xs">
                    {format.dateTime(r.createdAt, { dateStyle: "short", timeStyle: "short" })}
                    <span className="block text-muted-foreground">{format.relativeTime(r.createdAt)}</span>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CHIP[r.status] ?? ""}`}>{t(`support.statuses.${r.status as "new"}`)}</span>
                    {r.assignedTo && <span className="block text-xs text-muted-foreground">{r.assignedTo.split("@")[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

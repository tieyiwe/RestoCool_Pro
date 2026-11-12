import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { consoleActivity, consoleOwners, listCollaborators } from "@/lib/admin/team";
import { requireSuperadminPage } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

const field = "min-h-11 rounded-lg border border-border bg-surface px-3 text-base";

/** What every console person did: changes, sign-ins and pages opened, newest first. */
export default async function TeamActivity({ searchParams }: { searchParams: Promise<{ who?: string; type?: string; days?: string }> }) {
  await requireSuperadminPage("team");
  const sp = await searchParams;
  const db = getDb();
  const days = [1, 7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const type = sp.type === "changes" || sp.type === "visits" ? sp.type : "all";
  const who = sp.who?.trim().toLowerCase().slice(0, 200) || undefined;
  const [{ t, format }, rows, collabs] = await Promise.all([adminI18n(), consoleActivity(db, { who, action: type === "all" ? undefined : type, days, limit: 500 }), listCollaborators(db)]);
  const people = [...consoleOwners(), ...collabs.map((c) => c.email)];
  const names = new Map(collabs.map((c) => [c.email, c.name]));
  const label = (a: string) => {
    const k = `team.actions.${a.replace(/^admin\./, "").replace(/\./g, "_")}`;
    const v = t.has(k as "team.actions.viewed") ? t(k as "team.actions.viewed") : a;
    return v;
  };
  return (
    <div className="flex flex-col gap-5" data-testid="team-activity">
      <Link href="/admin_pro/team" className="text-sm font-semibold text-primary">
        ← {t("team.title")}
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold">{t("team.activityTitle")}</h1>
        <p className="text-muted-foreground">{t("team.activityIntro")}</p>
      </div>
      <form className="flex flex-wrap gap-2" role="search">
        <select name="who" defaultValue={who ?? ""} className={field} aria-label={t("team.activityWho")} data-testid="activity-who">
          <option value="">{t("team.activityEveryone")}</option>
          {people.map((e) => (
            <option key={e} value={e}>
              {names.get(e) ? `${names.get(e)} · ${e}` : e}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type} className={field} aria-label={t("team.activityType")}>
          <option value="all">{t("team.activityTypes.all")}</option>
          <option value="changes">{t("team.activityTypes.changes")}</option>
          <option value="visits">{t("team.activityTypes.visits")}</option>
        </select>
        <select name="days" defaultValue={String(days)} className={field} aria-label={t("team.activityDays")}>
          {[1, 7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {t("team.activityDaysN", { n: d })}
            </option>
          ))}
        </select>
        <button className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground">{t("support.filter")}</button>
      </form>
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="activity-table">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">{t("team.activityCols.when")}</th>
                  <th className="p-3">{t("team.activityCols.who")}</th>
                  <th className="p-3">{t("team.activityCols.what")}</th>
                  <th className="p-3">{t("team.activityCols.where")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const d = (r.data ?? {}) as Record<string, unknown>;
                  const detail = r.action === "admin.viewed" ? String(d.path ?? r.entityId ?? "") : d.email ? String(d.email) : d.status ? String(d.status) : d.reason ? String(d.reason) : "";
                  return (
                    <tr key={r.id} className={r.action === "admin.viewed" ? "text-muted-foreground" : ""}>
                      <td className="p-3 text-xs whitespace-nowrap">{format.dateTime(r.at, { dateStyle: "short", timeStyle: "medium" })}</td>
                      <td className="p-3 text-xs">{names.get(r.who ?? "") ?? r.who}</td>
                      <td className="p-3">
                        <span className="font-semibold">{label(r.action)}</span>
                        {detail && <span className="block truncate font-mono text-xs text-muted-foreground">{detail.slice(0, 120)}</span>}
                      </td>
                      <td className="p-3 text-xs">
                        {r.restaurantId && r.business ? (
                          <Link href={`/admin_pro/businesses/${r.restaurantId}`} className="font-semibold text-primary">
                            {r.business}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

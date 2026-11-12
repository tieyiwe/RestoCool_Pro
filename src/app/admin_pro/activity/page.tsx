import { desc, eq, isNull, sql } from "drizzle-orm";
import { adminI18n } from "@/lib/admin/i18n";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { appErrors, auditLog, restaurants } from "@/db/schema";
import { requireSuperadminPage } from "@/lib/auth/context";
import { resolveErrorAction } from "../actions";

export const dynamic = "force-dynamic";

/** Platform health: server errors (grouped, counted, resolvable) and the platform-wide activity log. */
export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string }> }) {
  await requireSuperadminPage("activity");
  const sp = await searchParams;
  const db = getDb();
  const q = (sp.q ?? "").trim().slice(0, 60);
  const [t, format, errors, activity] = await Promise.all([
    adminI18n().then((x) => x.t),
    adminI18n().then((x) => x.format),
    db.select().from(appErrors).where(isNull(appErrors.resolvedAt)).orderBy(desc(appErrors.lastAt)).limit(100),
    db
      .select({ a: auditLog, name: restaurants.name })
      .from(auditLog)
      .leftJoin(restaurants, eq(restaurants.id, auditLog.restaurantId))
      .where(q ? sql`${auditLog.action} ilike ${`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`}` : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(200),
  ]);
  return (
    <div className="flex flex-col gap-5" data-testid="admin-activity">
      <div>
        <h1 className="text-2xl font-extrabold">{t("activity.title")}</h1>
        <p className="text-muted-foreground">{t("activity.intro")}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
          ✓ {t("ok.resolved")}
        </p>
      )}
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>⚠️ {t("activity.errors", { n: errors.length })}</CardTitle>
          {errors.length > 0 && (
            <form action={resolveErrorAction}>
              <input type="hidden" name="id" value="all" />
              <button className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">{t("activity.resolveAll")}</button>
            </form>
          )}
        </div>
        {errors.length === 0 ? (
          <p className="text-sm text-emerald-800" data-testid="admin-no-errors">
            ✓ {t("activity.noErrors")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm" data-testid="admin-errors">
            {errors.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs break-words">{e.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.where ?? "—"} · ×{e.count} · {t("activity.last", { when: format.relativeTime(e.lastAt) })}
                  </p>
                </div>
                <form action={resolveErrorAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">{t("activity.resolve")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>🧾 {t("activity.log")}</CardTitle>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder={t("activity.filter")} className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base" />
            <button className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">{t("filters.apply")}</button>
          </form>
        </div>
        <ul className="flex flex-col divide-y divide-border text-sm" data-testid="admin-audit">
          {activity.map(({ a, name }) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="font-mono text-xs">{a.action}</span>
                {name && (
                  <Link href={`/admin_pro/businesses/${a.restaurantId}`} className="ml-2 text-xs font-semibold hover:underline">
                    {name}
                  </Link>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.actorType} · {format.dateTime(a.createdAt, { dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { requireSuperadmin } from "@/lib/auth/context";
import { effectiveStatus } from "@/lib/plan";

export default async function AdminHome() {
  await requireSuperadmin();
  const t = await getTranslations("admin");
  const tp = await getTranslations("app.plan");
  // Platform-wide read: super admin only, never via tenantRepo.
  const rows = await getDb().select().from(restaurants).orderBy(desc(restaurants.createdAt)).limit(200);
  return (
    <section>
      <h1 className="mb-4 text-2xl font-extrabold">{t("restaurants")}</h1>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">{t("colName")}</th>
              <th className="p-3">{t("colCity")}</th>
              <th className="p-3">{t("colPlan")}</th>
              <th className="p-3">{t("colStatus")}</th>
              <th className="p-3">{t("colPublished")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-semibold">
                  <a href={`/r/${r.slug}`} className="underline-offset-2 hover:underline">{r.name}</a>
                </td>
                <td className="p-3">{r.city}</td>
                <td className="p-3">{tp(r.plan)}</td>
                <td className="p-3">{tp(effectiveStatus(r))}</td>
                <td className="p-3">{r.published ? t("yes") : t("no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

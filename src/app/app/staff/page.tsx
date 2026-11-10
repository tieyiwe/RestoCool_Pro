import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { formatStaffNo, handledCounts, personnel } from "@/lib/personnel";

export const dynamic = "force-dynamic";

/**
 * Personnel: everyone working in this restaurant, with their « matricule » (unique staff ID)
 * and the orders they handled in the last 7 days. Adding servers and PIN logins comes with M5.
 */
export default async function StaffPage() {
  const ctx = await requireMemberPage("staff.write");
  const t = await getTranslations("personnel");
  const tr = await getTranslations("app.role");
  const since = new Date(Date.now() - 7 * 24 * 3600_000);
  const [people, counts] = await Promise.all([personnel(getDb(), ctx.repo.restaurantId), handledCounts(getDb(), ctx.repo.restaurantId, since)]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[34rem] text-sm" data-testid="personnel-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2">{t("staffNo")}</th>
              <th className="px-3 py-2">{t("name")}</th>
              <th className="px-3 py-2">{t("role")}</th>
              <th className="px-3 py-2 text-right">{t("confirmed")}</th>
              <th className="px-3 py-2 text-right">{t("prepared")}</th>
              <th className="px-3 py-2 text-right">{t("served")}</th>
              <th className="px-3 py-2 text-right">{t("cancelled")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map((p) => {
              const c = counts.get(p.id);
              return (
                <tr key={p.id} data-testid="personnel-row">
                  <td className="px-3 py-2 font-mono text-base font-bold" data-testid="staff-no">
                    {formatStaffNo(p.staffNo)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{p.name}</span>
                    {!p.active && (
                      <Badge variant="muted" className="ml-2">
                        {t("inactive")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{tr(p.role)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c?.confirmed ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c?.prepared ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c?.served ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c?.cancelled ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-sm text-muted-foreground">{t("period")}</p>
      <Card className="bg-muted/40 text-sm">{t("comingM5")}</Card>
    </div>
  );
}

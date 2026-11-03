import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { getMemberContext } from "@/lib/auth/context";
import { effectiveStatus } from "@/lib/plan";

export default async function DashboardPage() {
  const t = await getTranslations("app");
  const format = await getFormatter();
  const ctx = await getMemberContext();

  // Signed in but no restaurant yet: start onboarding.
  if (!ctx) redirect("/app/new");

  const r = await ctx.repo.restaurant.get();
  if (!r) return null;
  const [categories, itemCount, seats, areas, activity] = await Promise.all([
    ctx.repo.menu.categories(),
    ctx.repo.menu.countItems(),
    ctx.repo.seating.seats(),
    ctx.repo.seating.areas(),
    ctx.repo.audit.recent(10),
  ]);
  const status = effectiveStatus(r);

  const stats = [
    { label: t("stats.categories"), value: categories.length },
    { label: t("stats.items"), value: itemCount },
    { label: t("stats.seats"), value: seats.length },
    { label: t("stats.areas"), value: areas.length },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold" data-testid="restaurant-name">
          {r.name}
        </h1>
        <Badge>{t(`plan.${r.plan}`)}</Badge>
        <Badge variant={status === "active" || status === "trial" ? "muted" : "warning"}>{t(`plan.${status}`)}</Badge>
        <Badge variant="outline">{t(`role.${ctx.actor.role}`)}</Badge>
      </div>
      {status === "trial" && r.planExpiresAt && (
        <p className="text-sm text-muted-foreground">{t("plan.trialEnds", { date: format.dateTime(r.planExpiresAt, { dateStyle: "long" }) })}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-3xl font-extrabold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle className="mb-3">{t("recentActivity")}</CardTitle>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <span className="font-mono">{a.action}</span>
                <time className="text-muted-foreground" dateTime={a.createdAt.toISOString()}>
                  {format.dateTime(a.createdAt, { dateStyle: "short", timeStyle: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

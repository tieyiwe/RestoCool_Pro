import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { requireSuperadminPage } from "@/lib/auth/context";
import { platformReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { visible: "bg-emerald-100 text-emerald-900", hidden: "bg-amber-100 text-amber-900", deleted: "bg-red-100 text-red-900" };
const STATUSES = ["visible", "hidden", "deleted"] as const;

/**
 * Every customer review on the platform, including the ones businesses hid or deleted
 * (they disappear only from the business's page and list, never from here).
 */
export default async function AdminReviews({ searchParams }: { searchParams: Promise<{ status?: string; low?: string; b?: string }> }) {
  await requireSuperadminPage("businesses.read");
  const [{ t, format }, sp] = await Promise.all([adminI18n(), searchParams]);
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const low = sp.low === "1";
  const restaurantId = sp.b && /^[0-9a-f-]{36}$/.test(sp.b) ? sp.b : undefined;
  const { list, totals } = await platformReviews(getDb(), { status, maxStars: low ? 2 : undefined, restaurantId, limit: 300 });
  const qs = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ status, low: low ? "1" : undefined, b: restaurantId, ...p }).filter(([, v]) => v) as [string, string][]).toString();
    return q ? `/admin_pro/reviews?${q}` : "/admin_pro/reviews";
  };
  const chip = (active: boolean) => `flex min-h-10 items-center rounded-full border border-border px-3 text-sm font-semibold ${active ? "bg-foreground text-background" : ""}`;
  return (
    <div className="flex flex-col gap-5" data-testid="admin-reviews">
      <div>
        <h1 className="text-2xl font-extrabold">⭐ {t("reviews.title")}</h1>
        <p className="text-muted-foreground">{t("reviews.intro")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ["total", totals.total],
            ["average", totals.average ?? "—"],
            ["hidden", totals.hidden],
            ["deleted", totals.deleted],
            ["low", totals.low],
            ["lowRemoved", totals.lowRemoved],
            ["visible", totals.visible],
          ] as const
        ).map(([k, v]) => (
          <Card key={k} data-testid={`admin-reviews-${k}`}>
            <p className="text-sm text-muted-foreground">{t(`reviews.kpi.${k}`)}</p>
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={qs({ status: undefined })} className={chip(!status)}>
          {t("reviews.all")}
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s })} className={chip(status === s)}>
            {t(`reviews.status.${s}`)}
          </Link>
        ))}
        <Link href={qs({ low: low ? undefined : "1" })} className={chip(low)}>
          ★ ≤ 2
        </Link>
        {restaurantId && (
          <Link href={qs({ b: undefined })} className={chip(true)}>
            ✕ {list[0]?.business ?? t("reviews.business")}
          </Link>
        )}
      </div>
      {list.length === 0 ? (
        <Card className="text-center text-muted-foreground">{t("empty")}</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} data-testid="admin-review" data-status={r.status}>
              <Card className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[#E9B530]" aria-label={`${r.rating}/5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <Link href={`/admin_pro/businesses/${r.restaurantId}`} className="font-bold hover:underline">
                      {r.business}
                    </Link>
                    <Link href={qs({ b: r.restaurantId })} className="text-xs text-primary underline-offset-2 hover:underline">
                      {t("reviews.onlyThis")}
                    </Link>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[r.status] ?? ""}`}>{t(`reviews.status.${r.status}`)}</span>
                </div>
                {r.comment ? <p className="text-sm whitespace-pre-line">{r.comment}</p> : <p className="text-sm text-muted-foreground italic">{t("reviews.noComment")}</p>}
                <p className="text-xs text-muted-foreground">
                  {r.authorName || t("reviews.anonymous")} · {r.lang.toUpperCase()} · {format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  {r.orderCode ? ` · ${r.orderCode}` : ""}
                  {r.status !== "visible" && r.statusAt ? ` · ${t(`reviews.changed.${r.status}`)} ${format.dateTime(r.statusAt, { dateStyle: "medium", timeStyle: "short" })}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

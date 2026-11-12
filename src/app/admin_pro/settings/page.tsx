import { asc, isNotNull } from "drizzle-orm";
import { adminI18n } from "@/lib/admin/i18n";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { requireSuperadminPage } from "@/lib/auth/context";
import { getPlatformSettings } from "@/lib/platform/settings";
import { announcementAction, featuredAction, freeLaunchAction } from "../actions";

export const dynamic = "force-dynamic";
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";

/** Platform switches: launch offer, announcement to every business, « À la une ». */
export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireSuperadminPage();
  const sp = await searchParams;
  const [t, platform, featured] = await Promise.all([
    adminI18n().then((x) => x.t),
    getPlatformSettings(),
    getDb().select({ id: restaurants.id, name: restaurants.name, rank: restaurants.featuredRank }).from(restaurants).where(isNotNull(restaurants.featuredRank)).orderBy(asc(restaurants.featuredRank)),
  ]);
  const a = platform.announcement;
  return (
    <div className="flex max-w-3xl flex-col gap-5" data-testid="admin-settings">
      <div>
        <h1 className="text-2xl font-extrabold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.intro")}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(sp.ok === "featured" ? "ok.featured" : "ok.saved")}
        </p>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>🎁 {t("settings.freeLaunch")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("settings.freeLaunchHint")}</p>
        <p className="font-semibold" data-testid="admin-free-launch-state">
          {platform.freeLaunch ? `✓ ${t("settings.freeLaunchOn")}` : t("settings.freeLaunchOff")}
        </p>
        <form action={freeLaunchAction}>
          <input type="hidden" name="on" value={platform.freeLaunch ? "0" : "1"} />
          <button className={`min-h-11 rounded-lg px-4 font-bold ${platform.freeLaunch ? "border border-border bg-surface" : "bg-primary text-primary-foreground"}`} data-testid="admin-free-launch">
            {platform.freeLaunch ? t("settings.freeLaunchTurnOff") : t("settings.freeLaunchTurnOn")}
          </button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>📣 {t("settings.announcement")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("settings.announcementHint")}</p>
        <form action={announcementAction} className="flex flex-col gap-3" data-testid="admin-announcement-form">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Français</span>
            <input name="fr" defaultValue={a?.text.fr ?? ""} maxLength={280} required className={field} data-testid="admin-announcement-fr" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">English</span>
            <input name="en" defaultValue={a?.text.en ?? ""} maxLength={280} className={field} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">中文</span>
            <input name="zh" defaultValue={a?.text.zh ?? ""} maxLength={280} className={field} />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="active" defaultChecked={a?.active ?? true} className="size-5" data-testid="admin-announcement-active" /> {t("settings.announcementActive")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              {t("settings.level")}
              <select name="level" defaultValue={a?.level ?? "info"} className={field + " w-auto"}>
                <option value="info">{t("settings.levels.info")}</option>
                <option value="warning">{t("settings.levels.warning")}</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground" data-testid="admin-announcement-save">
              {t("settings.save")}
            </button>
          </div>
        </form>
        {a && (
          <form action={announcementAction}>
            <input type="hidden" name="clear" value="1" />
            <button className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">{t("settings.announcementClear")}</button>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>★ {t("settings.featured")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("settings.featuredHint")}</p>
        {featured.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {featured.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/admin_pro/businesses/${f.id}`} className="font-semibold hover:underline">
                  ★ {f.rank}. {f.name}
                </Link>
                <form action={featuredAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="rank" value="" />
                  <input type="hidden" name="back" value="settings" />
                  <button className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">{t("settings.featuredRemove")}</button>
                </form>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

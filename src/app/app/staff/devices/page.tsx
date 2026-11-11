import Link from "next/link";
import { cookies } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { DEVICE_COOKIE, deviceFromToken, listDevices, staffSessionSettings } from "@/lib/devices";
import { hasFeature } from "@/lib/plan";
import { authorizeDeviceAction, revokeDeviceAction } from "./actions";
import { SwitchToPost } from "./switch-to-post";

export const dynamic = "force-dynamic";

const OK = ["authorized", "revoked"];
const ERR = ["invalid", "forbidden", "notFound", "plan"];
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";

/**
 * « Appareils »: the tablets and phones where personnel log in with their PIN. Authorise this
 * device, see the others, revoke one (lost, stolen, replaced).
 */
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("devices.write");
  const t = await getTranslations("devices");
  const format = await getFormatter();
  const sp = await searchParams;
  const ok = sp.ok && OK.includes(sp.ok) ? sp.ok : null;
  const error = sp.error && ERR.includes(sp.error) ? sp.error : null;
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const r = (await ctx.repo.restaurant.get())!;
  const [list, here] = await Promise.all([listDevices(db, rid), deviceFromToken(db, (await cookies()).get(DEVICE_COOKIE)?.value)]);
  const thisDevice = here && here.device.restaurantId === rid ? here.device : null;
  const { shiftHours, idleMinutes } = staffSessionSettings(r);
  const allowed = hasFeature(r, "staff");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/app/staff" className="text-sm font-semibold text-primary">
          ← {t("back")}
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro", { shiftHours, idleMinutes })}</p>
      </div>
      {ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="devices-ok">
          {t(`ok.${ok}` as "ok.revoked")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {t(`err.${error}` as "err.invalid")}
        </p>
      )}

      {thisDevice ? (
        <Card className="flex flex-col gap-3 border-2 border-primary" data-testid="this-device">
          <CardTitle>✅ {t("thisAuthorized", { name: thisDevice.name })}</CardTitle>
          <p className="text-sm">{t("switchHint")}</p>
          <SwitchToPost label={t("switch")} />
        </Card>
      ) : allowed ? (
        <Card className="flex flex-col gap-3" data-testid="authorize-device">
          <CardTitle>📟 {t("authorize")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("authorizeHint")}</p>
          <form action={authorizeDeviceAction} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block font-semibold">{t("name")}</span>
              <input name="name" required minLength={2} maxLength={40} placeholder={t("namePlaceholder")} className={field} />
            </label>
            <Button type="submit">{t("authorizeSubmit")}</Button>
          </form>
        </Card>
      ) : (
        <Card className="bg-amber-50 text-amber-900">{t("err.plan")}</Card>
      )}

      <Card className="p-0">
        <CardTitle className="p-4 pb-2">{t("list")}</CardTitle>
        {list.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="device-list">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="device-row">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {d.name} {thisDevice?.id === d.id && <Badge variant="outline">{t("thisOne")}</Badge>}{" "}
                    {d.revokedAt ? <Badge variant="muted">{t("revoked")}</Badge> : d.openSessions ? <Badge>{t("inUse")}</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("since", { date: format.dateTime(d.createdAt, { dateStyle: "medium" }) })}
                    {d.authorizedByName ? ` · ${t("by", { name: d.authorizedByName })}` : ""}
                    {d.lastSeenAt ? ` · ${t("lastSeen", { date: format.relativeTime(d.lastSeenAt) })}` : ""}
                  </p>
                </div>
                {!d.revokedAt && (
                  <form action={revokeDeviceAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <ConfirmButton message={t("revokeConfirm", { name: d.name })} data-testid="device-revoke">
                      {t("revoke")}
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

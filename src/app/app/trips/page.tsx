import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { formatFCFA } from "@/lib/format";
import { routeLabel } from "@/lib/transport/routes";
import { startableRoutes, tripsOverview } from "@/lib/transport/trips";
import { endTripAction, startTripAction } from "./actions";

export const dynamic = "force-dynamic";

const OK = ["started", "ended"];
const ERR = ["busBusy", "notAssigned", "invalid", "forbidden", "notFound"];
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const TZ = "Africa/Ouagadougou";

/**
 * « Voyages » (bus companies): the hostess starts the trip of her bus on one of her itineraries;
 * travelers can then order from their seat. Ending the trip frees every seat for the next one.
 */
export default async function TripsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("orders.confirm");
  const r = (await ctx.repo.restaurant.get())!;
  if (r.kind !== "transport") redirect("/app/service");
  const t = await getTranslations("transport.trips");
  const format = await getFormatter();
  const sp = await searchParams;
  const ok = sp.ok && OK.includes(sp.ok) ? sp.ok : null;
  const error = sp.error && ERR.includes(sp.error) ? sp.error : null;
  const sctx = { db: getDb(), actor: ctx.actor, repo: ctx.repo };
  const [overview, myRoutes] = await Promise.all([tripsOverview(getDb(), r.id), startableRoutes(sctx)]);
  // Default departure: now, in Ouagadougou time (= UTC), for the datetime-local field.
  const nowLocal = new Date().toISOString().slice(0, 16);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="trips-ok">
          {t(`ok.${ok}` as "ok.started")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900" data-testid="trips-error">
          {t(`err.${error}` as "err.invalid")}
        </p>
      )}
      {overview.buses.length === 0 && (
        <Card className="text-center text-muted-foreground">
          {t("noBus")}{" "}
          <Link href="/app/buses" className="font-semibold text-primary underline">
            →
          </Link>
        </Card>
      )}
      {overview.buses.map(({ bus, open }) => (
        <Card key={bus.id} className="flex flex-col gap-3" data-testid="trip-bus" data-bus={bus.name}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>🚌 {bus.name}</CardTitle>
            {open ? <Badge>{t("onTrip")}</Badge> : <Badge variant="muted">{t("parked")}</Badge>}
          </div>
          {open ? (
            <>
              <p className="text-lg font-bold" data-testid="trip-route">
                {open.trip.route}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("departure", { time: format.dateTime(open.trip.departureAt, { dateStyle: "medium", timeStyle: "short", timeZone: TZ }) })}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted p-2">
                  <p className="text-2xl font-extrabold tabular-nums">{open.orders}</p>
                  <p className="text-xs text-muted-foreground">{t("orders")}</p>
                </div>
                <div className={`rounded-xl p-2 ${open.toConfirm ? "bg-amber-100" : "bg-muted"}`}>
                  <p className="text-2xl font-extrabold tabular-nums">{open.toConfirm}</p>
                  <p className="text-xs text-muted-foreground">{t("toConfirm")}</p>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <p className="text-lg font-extrabold tabular-nums">{formatFCFA(open.total) ?? "0 F"}</p>
                  <p className="text-xs text-muted-foreground">{t("total")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/app/trips/${open.trip.id}`} data-testid="trip-open">
                    📋 {t("seeOrders")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/app/scan">📷 {t("scan")}</Link>
                </Button>
                <form action={endTripAction}>
                  <input type="hidden" name="id" value={open.trip.id} />
                  <ConfirmButton message={t("endConfirm")} data-testid="trip-end">
                    {t("end")}
                  </ConfirmButton>
                </form>
              </div>
            </>
          ) : myRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRoute")}</p>
          ) : (
            <form action={startTripAction} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" data-testid="trip-start">
              <input type="hidden" name="busId" value={bus.id} />
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("route")}</span>
                <select name="routeId" className={field} required>
                  {myRoutes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {routeLabel(rt)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("departureLabel")}</span>
                <input name="departure" type="datetime-local" defaultValue={nowLocal} className={field} />
              </label>
              <Button type="submit" data-testid="trip-start-submit">
                ▶ {t("start")}
              </Button>
            </form>
          )}
        </Card>
      ))}
      {overview.recent.length > 0 && (
        <Card>
          <CardTitle className="mb-2">{t("recent")}</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {overview.recent.map((tr) => (
              <li key={tr.id} className="flex justify-between gap-3 py-2">
                <Link href={`/app/trips/${tr.id}`} className="font-semibold hover:underline">
                  {tr.route}
                </Link>
                <span className="text-muted-foreground">{format.dateTime(tr.departureAt, { dateStyle: "short", timeStyle: "short", timeZone: TZ })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

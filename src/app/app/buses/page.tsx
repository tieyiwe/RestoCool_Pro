import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CityField } from "@/components/forms/city-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { BusForm } from "@/components/transport/bus-form";
import { SeatMap } from "@/components/transport/seat-map";
import { getDb } from "@/db";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { formatStaffNo, personnel } from "@/lib/personnel";
import { busSeats, listBuses } from "@/lib/transport/buses";
import { buildSeatMap } from "@/lib/transport/layout";
import { listRoutes } from "@/lib/transport/routes";
import { assignRouteAction, createBusAction, createRouteAction, deleteBusAction, deleteRouteAction, renameBusAction, updateBusLayoutAction } from "./actions";

export const dynamic = "force-dynamic";

const OK = ["busCreated", "busUpdated", "busRenamed", "busDeleted", "routeCreated", "routeDeleted", "routeAssigned"];
const ERR = ["duplicate", "tripOpen", "invalid", "forbidden", "notFound"];
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";

/**
 * Transport businesses: their buses (seat maps generated from a few numbers, seat-back QR codes)
 * and their itineraries, with the hostesses assigned to each itinerary.
 */
export default async function BusesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; n?: string }> }) {
  const ctx = await requireMemberPage("seats.write");
  const t = await getTranslations("transport");
  const sp = await searchParams;
  const ok = sp.ok && OK.includes(sp.ok) ? sp.ok : null;
  const error = sp.error && ERR.includes(sp.error) ? sp.error : null;
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const canStaff = can(ctx.actor, "staff.write", { restaurantId: rid });
  const [list, routes, people] = await Promise.all([listBuses(db, rid), listRoutes(db, rid), personnel(db, rid)]);
  const seatsByBus = new Map(await Promise.all(list.map(async (b) => [b.id, await busSeats(db, rid, b.id)] as const)));
  const team = people.filter((p) => p.active && p.role !== "owner");
  const labels = { front: t("bus.front"), back: t("bus.backLabel"), door: t("bus.doorShort"), window: t("bus.window"), aisle: t("bus.aisle") };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="buses-ok">
          {t(`ok.${ok}` as "ok.busCreated", { n: Number(sp.n ?? 0) })}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900" data-testid="buses-error">
          {t(`err.${error}` as "err.invalid")}
        </p>
      )}

      {/* Buses */}
      <section className="flex flex-col gap-3" aria-labelledby="buses-title">
        <h2 id="buses-title" className="text-xl font-bold">
          🚌 {t("buses")}
        </h2>
        {list.length === 0 && <p className="text-muted-foreground">{t("noBus")}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((b) => {
            const map = buildSeatMap(b.layout);
            const seats = seatsByBus.get(b.id) ?? [];
            return (
              <Card key={b.id} className="flex flex-col gap-3" data-testid="bus-card" data-bus={b.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-extrabold">{b.name}</h3>
                  <span className="text-sm text-muted-foreground">
                    {t("seats", { n: b.seatCount })} {b.openTrip && <Badge>{t("onTrip", { route: b.openTrip })}</Badge>}
                  </span>
                </div>
                <SeatMap
                  seats={seats.map((s) => ({ key: s.id, label: s.label, row: s.row ?? 0, col: s.col ?? 0, position: s.position }))}
                  columns={map.columns}
                  rows={map.rows}
                  doorRow={b.layout.doorRow}
                  doorSide={b.layout.doorSide}
                  aisleCol={b.layout.left}
                  size="sm"
                  labels={labels}
                  testId="bus-map"
                />
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/app/buses/${b.id}/print`} data-testid="bus-print">
                      🖨️ {t("printSeats")}
                    </Link>
                  </Button>
                </div>
                <details className="rounded-xl border border-border p-3">
                  <summary className="min-h-11 cursor-pointer content-center font-semibold">{t("editLayout")}</summary>
                  <p className="my-2 text-xs text-muted-foreground">{t("editLayoutHint")}</p>
                  <BusForm action={updateBusLayoutAction} initial={b.layout} busId={b.id} submitLabel={t("saveLayout")} testId="bus-layout-form" />
                </details>
                <div className="flex flex-wrap items-end gap-2">
                  <form action={renameBusAction} className="flex flex-1 items-end gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <label className="min-w-0 flex-1 text-sm">
                      <span className="mb-1 block font-semibold">{t("bus.name")}</span>
                      <input name="name" defaultValue={b.name} maxLength={40} className={field} />
                    </label>
                    <Button type="submit" variant="outline">
                      {t("rename")}
                    </Button>
                  </form>
                  <form action={deleteBusAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmButton message={t("deleteConfirm", { name: b.name })}>{t("delete")}</ConfirmButton>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardTitle className="mb-1">➕ {t("addBus")}</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">{t("addBusHint")}</p>
          <BusForm action={createBusAction} submitLabel={t("addBusSubmit")} />
        </Card>
      </section>

      {/* Itineraries */}
      <section id="routes" className="flex scroll-mt-20 flex-col gap-3" aria-labelledby="routes-title">
        <h2 id="routes-title" className="text-xl font-bold">
          🛣️ {t("routes")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("routesIntro")}</p>
        {routes.length === 0 && <p className="text-muted-foreground">{t("noRoute")}</p>}
        <ul className="flex flex-col gap-3" data-testid="route-list">
          {routes.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2" data-testid="route-card" data-route={r.label}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-extrabold">{r.label}</h3>
                  <form action={deleteRouteAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton message={t("deleteRouteConfirm", { route: r.label })}>{t("delete")}</ConfirmButton>
                  </form>
                </div>
                <p className="text-sm" data-testid="route-people">
                  {r.people.length ? `👩‍✈️ ${r.people.map((p) => `${p.name ?? "—"} (${formatStaffNo(p.staffNo)})`).join(", ")}` : <span className="text-muted-foreground">{t("nobodyAssigned")}</span>}
                </p>
                {canStaff && (
                  <details>
                    <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-primary">{t("assign")}</summary>
                    {team.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noTeam")}</p>
                    ) : (
                      <form action={assignRouteAction} className="mt-2 flex flex-col gap-2" data-testid="route-assign">
                        <input type="hidden" name="id" value={r.id} />
                        <div className="flex flex-wrap gap-2">
                          {team.map((p) => (
                            <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                              <input type="checkbox" name="member" value={p.id} defaultChecked={r.people.some((x) => x.memberId === p.id)} className="size-4" />
                              {p.name} · {formatStaffNo(p.staffNo)}
                            </label>
                          ))}
                        </div>
                        <div>
                          <Button type="submit">{t("assignSave")}</Button>
                        </div>
                      </form>
                    )}
                  </details>
                )}
              </Card>
            </li>
          ))}
        </ul>
        <Card>
          <CardTitle className="mb-3">➕ {t("addRoute")}</CardTitle>
          <form action={createRouteAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="route-form">
            <CityField name="origin" id="route-origin" label={t("origin")} defaultValue="Ouagadougou" className={field} />
            <CityField name="destination" id="route-destination" label={t("destination")} defaultValue="Bobo-Dioulasso" className={field} />
            <Button type="submit">{t("addRouteSubmit")}</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}

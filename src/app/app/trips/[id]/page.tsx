import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { LiveRefresh } from "@/components/app-shell/live-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { pickText } from "@/i18n/config";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { formatFCFA } from "@/lib/format";
import { tripBoard } from "@/lib/transport/rounds";
import { cn } from "@/lib/utils";
import { confirmTripOrdersAction, moveOrderAction, serveAllAction } from "./actions";

export const dynamic = "force-dynamic";

const TZ = "Africa/Ouagadougou";

/**
 * One trip, for the hostess: the round she just scanned (confirm it in one tap), what to prepare,
 * then every order by seat number (the order she walks the aisle). Two phones on the same seat
 * are shown in red so she checks the tickets. Updates live.
 */
export default async function TripPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ round?: string; ok?: string; n?: string }> }) {
  const ctx = await requireMemberPage("orders.read");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("transport.round");
  const ts = await getTranslations("service.status");
  const format = await getFormatter();
  const locale = await getLocale();
  const rid = ctx.repo.restaurantId;
  const board = await tripBoard(getDb(), rid, id);
  const canConfirm = can(ctx.actor, "orders.confirm", { restaurantId: rid });
  const canServe = can(ctx.actor, "orders.serve", { restaurantId: rid });
  const roundIds = (sp.round ?? "").split(",").filter(Boolean);
  const round = board.orders.filter((o) => roundIds.includes(o.id));
  const roundToConfirm = round.filter((o) => o.status === "sent");
  const name = (n: { fr: string } & Partial<Record<string, string>>) => pickText(n, locale);
  const open = board.trip.status === "open";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="trip-board">
      {open && <LiveRefresh />}
      <div>
        <Link href="/app/trips" className="text-sm font-semibold text-primary">
          ← {t("back")}
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">{board.trip.route}</h1>
        <p className="text-sm text-muted-foreground">
          {format.dateTime(board.trip.departureAt, { dateStyle: "medium", timeStyle: "short", timeZone: TZ })} · {open ? t("open") : t("closed")}
        </p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="round-ok">
          {t(sp.ok === "served" ? "okServed" : "okConfirmed", { n: Number(sp.n ?? 0) })}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className={cn("rounded-xl p-2", board.counts.toConfirm ? "bg-amber-100" : "bg-muted")}>
          <p className="text-2xl font-extrabold tabular-nums" data-testid="count-to-confirm">
            {board.counts.toConfirm}
          </p>
          <p className="text-xs">{t("toConfirm")}</p>
        </div>
        <div className="rounded-xl bg-muted p-2">
          <p className="text-2xl font-extrabold tabular-nums">{board.counts.toServe}</p>
          <p className="text-xs">{t("toServe")}</p>
        </div>
        <div className="rounded-xl bg-muted p-2">
          <p className="text-lg font-extrabold tabular-nums">{formatFCFA(board.counts.total) ?? "0 F"}</p>
          <p className="text-xs">{t("total")}</p>
        </div>
      </div>

      {/* The round she just scanned: one tap confirms it. */}
      {round.length > 0 && (
        <Card className="flex flex-col gap-2 border-2 border-primary" data-testid="round">
          <CardTitle>📷 {t("roundTitle", { n: round.length })}</CardTitle>
          <p className="text-sm">{t("roundSeats", { seats: round.map((o) => o.seatLabel).join(", ") })}</p>
          {canConfirm && roundToConfirm.length > 0 ? (
            <form action={confirmTripOrdersAction}>
              <input type="hidden" name="trip" value={board.trip.id} />
              <input type="hidden" name="ids" value={roundToConfirm.map((o) => o.id).join(",")} />
              <Button type="submit" size="lg" className="w-full" data-testid="round-confirm">
                ✓ {t("confirmRound", { n: roundToConfirm.length })}
              </Button>
            </form>
          ) : (
            <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">✓ {t("roundDone")}</p>
          )}
          {open && (
            <Button asChild variant="outline">
              <Link href={`/app/scan?trip=${board.trip.id}&round=${roundIds.join(",")}`}>＋ {t("continueRound")}</Link>
            </Button>
          )}
        </Card>
      )}

      {board.doubles.length > 0 && (
        <p role="alert" className="rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm font-semibold text-red-900" data-testid="doubles">
          ⚠️ {t("doubles", { seats: board.doubles.join(", ") })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {open && (
          <Button asChild>
            <Link href={`/app/scan?trip=${board.trip.id}`} data-testid="start-round">
              📷 {t("scanRound")}
            </Link>
          </Button>
        )}
        {canConfirm && board.counts.toConfirm > 0 && (
          <form action={confirmTripOrdersAction}>
            <input type="hidden" name="trip" value={board.trip.id} />
            <Button type="submit" variant="outline" data-testid="confirm-all">
              ✓ {t("confirmAll", { n: board.counts.toConfirm })}
            </Button>
          </form>
        )}
        {canServe && board.counts.toServe > 0 && (
          <form action={serveAllAction}>
            <input type="hidden" name="trip" value={board.trip.id} />
            <Button type="submit" variant="outline" data-testid="serve-all">
              🍽️ {t("serveAll")}
            </Button>
          </form>
        )}
      </div>

      {/* What to prepare: dish totals of everything not served yet. */}
      <Card data-testid="to-prepare">
        <CardTitle className="mb-2">🧺 {t("toPrepare")}</CardTitle>
        {board.toPrepare.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nothingToPrepare")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {board.toPrepare.map((x, i) => (
              <li key={i} className="flex items-baseline gap-3 py-1.5">
                <span className="w-10 text-right text-lg font-extrabold tabular-nums">{x.qty}×</span>
                <span className="font-semibold">
                  {name(x.name)}
                  {x.variant ? <span className="font-normal text-muted-foreground"> · {name(x.variant)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Orders by seat number. */}
      <section aria-labelledby="by-seat" className="flex flex-col gap-2">
        <h2 id="by-seat" className="text-lg font-bold">
          💺 {t("bySeat")}
        </h2>
        {board.orders.length === 0 && <p className="text-muted-foreground">{t("noOrders")}</p>}
        {board.orders.map((o) => (
          <Card
            key={o.id}
            id={`o-${o.id}`}
            className={cn("flex scroll-mt-20 gap-3", o.double && o.status !== "cancelled" && "border-2 border-red-500 bg-red-50/50", roundIds.includes(o.id) && "ring-2 ring-primary")}
            data-testid="trip-order"
            data-seat={o.seatLabel ?? ""}
          >
            <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#26130c] text-white" aria-label={t("seat", { n: o.seatLabel ?? "?" })}>
              <span className="text-[10px] uppercase opacity-80">{t("seatShort")}</span>
              <span className="text-xl font-extrabold leading-none">{o.seatLabel}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={o.status === "sent" ? "warning" : o.status === "cancelled" ? "muted" : "outline"}>{ts(o.status)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {o.code ?? `n° ${o.number}`} · {format.dateTime(o.sentAt, { dateStyle: "short", timeStyle: "short", timeZone: TZ })}
                </span>
                {o.double && o.status !== "cancelled" && <span className="text-xs font-bold text-red-700">⚠️ {t("doubleTag")}</span>}
              </div>
              <ul className="mt-1 text-sm">
                {o.items.map((i) => (
                  <li key={i.id}>
                    <b>{i.qty}×</b> {name(i.nameSnapshot)}
                    {i.variantName ? <span className="text-muted-foreground"> · {name(i.variantName)}</span> : null}
                    {i.note ? <span className="text-muted-foreground"> · « {i.note} »</span> : null}
                  </li>
                ))}
              </ul>
              {o.note && <p className="mt-1 text-sm italic text-muted-foreground">« {o.note} »</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold tabular-nums">{o.hasOnRequest && !o.subtotal ? t("onRequest") : formatFCFA(o.subtotal)}</span>
                <div className="flex gap-2">
                  {canConfirm && o.status === "sent" && (
                    <form action={moveOrderAction}>
                      <input type="hidden" name="trip" value={board.trip.id} />
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="to" value="confirmed" />
                      <Button type="submit" data-testid="order-confirm">
                        ✓ {t("confirm")}
                      </Button>
                    </form>
                  )}
                  {canServe && ["confirmed", "preparing", "ready"].includes(o.status) && (
                    <form action={moveOrderAction}>
                      <input type="hidden" name="trip" value={board.trip.id} />
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="to" value="served" />
                      <Button type="submit" variant="outline" data-testid="order-served">
                        🍽️ {t("served")}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

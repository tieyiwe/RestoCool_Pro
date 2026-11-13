import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { LiveRefresh } from "@/components/app-shell/live-refresh";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import type { Reservation } from "@/db/schema";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { formatBfPhone, telHref } from "@/lib/format";
import { businessReservations, reservationConfig, reservationsInPlan } from "@/lib/reservations";
import { cn } from "@/lib/utils";
import { contactedAction, moveReservationAction, reservationSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reservations"))("title") };
}

const TONE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-950",
  confirmed: "bg-emerald-100 text-emerald-900",
  seated: "bg-sky-100 text-sky-900",
  completed: "bg-muted text-foreground",
  declined: "bg-red-100 text-red-900",
  cancelled: "bg-red-100 text-red-900",
  no_show: "bg-red-100 text-red-900",
};
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** « Réservations »: requests to answer first, then each day; call, confirm, seat; and the rules. */
export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ day?: string; ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("reservations.write");
  const [t, format, sp] = await Promise.all([getTranslations("reservations"), getFormatter(), searchParams]);
  const r = await ctx.repo.restaurant.get();
  if (!r) return null;
  const cfg = reservationConfig(r);
  const inPlan = reservationsInPlan(r);
  const canSettings = can(ctx.actor, "settings.write", { restaurantId: r.id });
  const start = today();
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : start;
  const strip = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const { list, waiting } = await businessReservations({ db: getDb(), actor: ctx.actor, restaurantId: r.id }, start < day ? start : day, addDays(start, 60));
  const ofDay = list.filter((x) => x.date === day);
  const perDay = new Map<string, { n: number; covers: number; waiting: number }>();
  for (const x of list) {
    if (["declined", "cancelled"].includes(x.status)) continue;
    const c = perDay.get(x.date) ?? { n: 0, covers: 0, waiting: 0 };
    c.n++;
    c.covers += x.partySize;
    if (x.status === "requested") c.waiting++;
    perDay.set(x.date, c);
  }
  const dateLong = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const dayCovers = ofDay.filter((x) => !["declined", "cancelled", "no_show"].includes(x.status)).reduce((s, x) => s + x.partySize, 0);

  return (
    <div className="flex flex-col gap-5" data-testid="reservations-page">
      <LiveRefresh events={["reservation"]} every={30_000} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">📅 {t("title")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-bold", cfg.enabled && inPlan ? "bg-emerald-100 text-emerald-900" : "bg-muted")} data-testid="reservations-state">
          {cfg.enabled && inPlan ? t("stateOn") : t("stateOff")}
        </span>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-900" data-testid="reservations-ok">
          {t(`ok.${sp.ok}`)}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">
          {t(`errors.${sp.error === "settings" ? "settings" : "moved"}`)}
        </p>
      )}
      {!inPlan && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">{t("planNeeded")}</p>}
      {inPlan && !cfg.enabled && (
        <p className="rounded-xl border border-border bg-muted p-3">
          {t("offHint")}{" "}
          {canSettings && (
            <a href="#settings" className="font-bold underline">
              {t("turnOn")}
            </a>
          )}
        </p>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="waiting-title" data-testid="reservations-waiting">
          <h2 id="waiting-title" className="mb-2 text-lg font-extrabold">
            🔔 {t("waitingTitle", { n: waiting.length })}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("waitingHint")}</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {waiting.map((x) => (
              <ReservationCard key={x.id} x={x} t={t} day={day} showDate={dateLong(x.date)} business={r.name} format={format} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="day-title">
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" aria-label={t("days")}>
          {strip.map((d, i) => {
            const c = perDay.get(d);
            return (
              <Link
                key={d}
                href={`/app/reservations?day=${d}`}
                aria-current={d === day ? "date" : undefined}
                className={cn("flex min-h-16 min-w-20 shrink-0 flex-col items-center justify-center rounded-xl border-2 px-2 text-sm", d === day ? "border-primary bg-primary/10 font-bold" : "border-border bg-surface")}
                data-testid="resv-day-tab"
              >
                <span className="text-xs text-muted-foreground">{i === 0 ? t("today") : i === 1 ? t("tomorrow") : format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: "short", timeZone: "UTC" })}</span>
                <span>{format.dateTime(new Date(`${d}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                {c ? (
                  <span className={cn("mt-0.5 rounded-full px-1.5 text-[11px] font-bold", c.waiting ? "bg-amber-200 text-amber-950" : "bg-muted")}>{t("dayCount", { n: c.n, covers: c.covers })}</span>
                ) : (
                  <span className="mt-0.5 text-[11px] text-muted-foreground">—</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="day-title" className="text-lg font-extrabold first-letter:uppercase">
            {dateLong(day)}
          </h2>
          <p className="text-sm text-muted-foreground">{t("dayTotal", { n: ofDay.length, covers: dayCovers })}</p>
        </div>
        {ofDay.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground" data-testid="reservations-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2" data-testid="reservations-day">
            {ofDay.map((x) => (
              <ReservationCard key={x.id} x={x} t={t} day={day} business={r.name} format={format} />
            ))}
          </ul>
        )}
      </section>

      {canSettings && (
        <Card className="flex flex-col gap-4" id="settings">
          <h2 className="text-lg font-extrabold">⚙️ {t("settings.title")}</h2>
          <form action={reservationSettingsAction} className="grid gap-4 sm:grid-cols-2" data-testid="reservations-settings">
            <label className="flex min-h-11 items-center gap-3 font-semibold sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="h-6 w-6" data-testid="reservations-enabled" />
              {t("settings.enabled")}
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("settings.slot")}
              <select name="slotMinutes" defaultValue={cfg.slotMinutes} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base">
                {[15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {t("settings.minutes", { n })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("settings.maxParty")}
              <input type="number" name="maxParty" min={1} max={200} defaultValue={cfg.maxParty} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("settings.covers")}
              <input type="number" name="maxCoversPerSlot" min={0} max={2000} defaultValue={cfg.maxCoversPerSlot} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base" />
              <span className="text-xs font-normal text-muted-foreground">{t("settings.coversHint")}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("settings.notice")}
              <select name="noticeMinutes" defaultValue={cfg.noticeMinutes} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base">
                {[0, 30, 60, 120, 240, 1440].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t("settings.noNotice") : n < 60 ? t("settings.minutes", { n }) : t("settings.hours", { n: n / 60 })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("settings.daysAhead")}
              <input type="number" name="daysAhead" min={1} max={365} defaultValue={cfg.daysAhead} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
              {t("settings.note")}
              <textarea name="note" maxLength={300} rows={2} defaultValue={cfg.note ?? ""} placeholder={t("settings.notePlaceholder")} className="rounded-lg border border-border bg-surface p-2 text-base" />
            </label>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t("settings.hoursHint")}{" "}
              <Link href="/app/settings#hours" className="font-semibold underline">
                {t("settings.hoursLink")}
              </Link>
            </p>
            <button type="submit" className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground sm:col-span-2 sm:justify-self-start" data-testid="reservations-save">
              {t("settings.save")}
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"reservations">>>;
type F = Awaited<ReturnType<typeof getFormatter>>;

/** One reservation: who, when, how many; call / WhatsApp / email; the next steps as buttons. */
function ReservationCard({ x, t, day, showDate, business, format }: { x: Reservation; t: T; day: string; showDate?: string; business: string; format: F }) {
  const wa = `https://wa.me/${x.phone}?text=${encodeURIComponent(t("waText", { name: x.name.split(/\s+/)[0] ?? x.name, business, date: x.date.split("-").reverse().join("/"), time: x.time, n: x.partySize }))}`;
  const btn = "min-h-11 rounded-lg px-3 text-sm font-bold";
  const Act = ({ action, label, tone, reason }: { action: string; label: string; tone: string; reason?: boolean }) => (
    <form action={moveReservationAction} className={reason ? "flex w-full flex-wrap gap-2" : undefined}>
      <input type="hidden" name="id" value={x.id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="day" value={day} />
      {reason && <input name="reason" maxLength={300} placeholder={t("reasonPlaceholder")} aria-label={t("reasonPlaceholder")} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-base" />}
      <button type="submit" className={cn(btn, tone)} data-testid={`resv-${action}`}>
        {label}
      </button>
    </form>
  );
  return (
    <li className="rounded-2xl border border-border bg-surface p-4" data-testid="reservation-card" data-status={x.status} data-ref={x.ref}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold tabular-nums">
            {x.time} <span className="text-base font-bold">· {t("guests", { n: x.partySize })}</span>
          </p>
          {showDate && <p className="text-sm font-semibold first-letter:uppercase">{showDate}</p>}
          <p className="text-lg font-bold">{x.name}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", TONE[x.status])} data-testid="resv-status">
          {t(`status.${x.status}`)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <a href={telHref(`+${x.phone}`)} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 font-bold text-primary-foreground" data-testid="resv-call">
          📞 {formatBfPhone(`+${x.phone}`)}
        </a>
        <a href={wa} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg bg-[#25D366] px-3 font-bold text-black">
          💬 WhatsApp
        </a>
        <a href={`mailto:${x.email}`} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold break-all">
          ✉️ {x.email}
        </a>
      </div>
      {x.note && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">« {x.note} »</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {x.ref} · {t("received", { at: format.dateTime(x.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
        {x.contactedAt ? ` · ✓ ${t("contactedAt", { at: format.dateTime(x.contactedAt, { hour: "2-digit", minute: "2-digit" }) })}` : ""}
        {x.cancelledBy === "customer" ? ` · ${t("cancelledByCustomer")}` : ""}
      </p>
      {x.reason && <p className="mt-1 text-xs text-muted-foreground">{t("reasonShown", { reason: x.reason })}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {x.status === "requested" && !x.contactedAt && (
          <form action={contactedAction}>
            <input type="hidden" name="id" value={x.id} />
            <input type="hidden" name="day" value={day} />
            <button type="submit" className={cn(btn, "border border-border")} data-testid="resv-contacted">
              ☎️ {t("actions.contacted")}
            </button>
          </form>
        )}
        {x.status === "requested" && <Act action="confirm" label={`✓ ${t("actions.confirm")}`} tone="bg-emerald-600 text-white" />}
        {(x.status === "requested" || x.status === "confirmed") && <Act action="seat" label={`🪑 ${t("actions.seat")}`} tone="border border-border" />}
        {x.status === "seated" && <Act action="complete" label={`✓ ${t("actions.complete")}`} tone="bg-emerald-600 text-white" />}
        {x.status === "confirmed" && <Act action="no_show" label={t("actions.noShow")} tone="border border-border" />}
      </div>
      {(x.status === "requested" || x.status === "confirmed") && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted-foreground">{x.status === "requested" ? t("actions.declineOpen") : t("actions.cancelOpen")}</summary>
          <Act action={x.status === "requested" ? "decline" : "cancel"} label={x.status === "requested" ? t("actions.decline") : t("actions.cancel")} tone="bg-red-600 text-white" reason />
          <p className="mt-1 text-xs text-muted-foreground">{t("emailNote")}</p>
        </details>
      )}
    </li>
  );
}

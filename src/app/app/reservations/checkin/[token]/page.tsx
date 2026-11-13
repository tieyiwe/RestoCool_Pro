import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { getMemberContext } from "@/lib/auth/context";
import { formatBfPhone, telHref } from "@/lib/format";
import { canCheckIn, expiresAt, qrValid, reservationByCheckin, reservationConfig } from "@/lib/reservations";
import { cn } from "@/lib/utils";
import { checkInAction } from "../../actions";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reservations.checkin"))("title") };
}

/**
 * The screen a scanned reservation QR opens for staff: who, how many, when, and one big button to
 * check them in. Once done (or past its expiry) the same QR only shows that state.
 */
export default async function CheckinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ result?: string }> }) {
  const ctx = await getMemberContext();
  if (!ctx) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/rv/${(await params).token}`)}`);
  const rid = ctx.repo.restaurantId;
  if (!canCheckIn(ctx.actor, rid)) notFound();
  const [{ token }, sp, t, format] = await Promise.all([params, searchParams, getTranslations("reservations"), getFormatter()]);
  const r = await ctx.repo.restaurant.get();
  const x = r ? await reservationByCheckin(getDb(), rid, token) : null;
  if (!r || !x) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 py-8 text-center" data-testid="checkin-screen" data-state="unknown">
        <p className="text-5xl">❓</p>
        <h1 className="text-2xl font-extrabold">{t("checkin.unknownTitle")}</h1>
        <p className="text-muted-foreground">{t("checkin.unknownText")}</p>
        <Link href="/app/scan" className="min-h-12 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground">
          📷 {t("checkin.scanAnother")}
        </Link>
      </div>
    );
  }
  const cfg = reservationConfig(r);
  const now = new Date();
  const exp = expiresAt(x, cfg);
  const start = Date.parse(`${x.date}T${x.time}:00Z`);
  const state = x.checkedInAt
    ? "used"
    : qrValid(x, cfg, now)
      ? now.getTime() < start - 180 * 60_000
        ? "early"
        : "valid"
      : x.status === "confirmed" || x.status === "no_show" || x.status === "expired"
        ? "expired"
        : "invalid";
  const justDone = sp.result === "ok";
  const tone = justDone ? "bg-emerald-600 text-white" : state === "valid" ? "bg-sky-50" : state === "used" ? "bg-amber-50" : "bg-red-50";
  const when = format.dateTime(new Date(`${x.date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-4" data-testid="checkin-screen" data-state={justDone ? "done" : state}>
      <div className={cn("rounded-3xl p-5 text-center", tone)}>
        <p className="text-5xl" aria-hidden>
          {justDone ? "✅" : state === "valid" ? "🎟️" : state === "used" ? "↩️" : state === "early" ? "⏰" : "⛔"}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold" data-testid="checkin-title">
          {justDone ? t("checkin.doneTitle", { name: x.name.split(/\s+/)[0] ?? x.name }) : t(`checkin.state.${state}`)}
        </h1>
        {state === "used" && !justDone && x.checkedInAt && (
          <p className="mt-1 text-sm">{t("checkin.usedAt", { at: format.dateTime(x.checkedInAt, { hour: "2-digit", minute: "2-digit" }) })}</p>
        )}
        {state === "expired" && <p className="mt-1 text-sm">{t("checkin.expiredAt", { at: format.dateTime(exp, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) })}</p>}
        {state === "early" && <p className="mt-1 text-sm">{t("checkin.earlyHint")}</p>}
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-3xl font-extrabold tabular-nums">
          {x.time} · {t("guests", { n: x.partySize })}
        </p>
        <p className="first-letter:uppercase">{when}</p>
        <p className="mt-1 text-xl font-bold">{x.name}</p>
        {x.note && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">« {x.note} »</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          {x.ref} ·{" "}
          <a href={telHref(`+${x.phone}`)} className="underline">
            {formatBfPhone(`+${x.phone}`)}
          </a>
        </p>
      </div>
      {state === "valid" && !justDone && (
        <form action={checkInAction}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="min-h-16 w-full rounded-2xl bg-emerald-600 text-xl font-extrabold text-white" data-testid="checkin-confirm">
            ✓ {t("checkin.confirm", { n: x.partySize })}
          </button>
        </form>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/app/scan" className="flex min-h-12 items-center justify-center rounded-xl border border-border font-bold">
          📷 {t("checkin.scanAnother")}
        </Link>
        <Link href={`/app/reservations?day=${x.date}`} className="flex min-h-12 items-center justify-center rounded-xl border border-border font-bold">
          📅 {t("title")}
        </Link>
      </div>
    </div>
  );
}

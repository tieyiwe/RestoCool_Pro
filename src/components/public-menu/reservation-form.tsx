"use client";

import { useEffect, useMemo, useState } from "react";
import type { makeT } from "@/lib/public-menu/translate";
import { cn } from "@/lib/utils";
import { deviceId } from "./seating";

type T = ReturnType<typeof makeT>;
type Lang = "fr" | "en" | "zh";
type Info = { open: boolean; maxParty: number; daysAhead: number; note: string | null; slots: Array<{ time: string; left: number | null }> };
type Done = { ref: string; link: string | null; duplicate: boolean };

const CONTACT_KEY = "rc-resv-contact";
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * « Réserver une table »: day, time (free slots from the business's hours), guests, name, email,
 * phone and an optional note. RestoCool emails the customer; the business calls to confirm.
 */
export function ReservationForm({ slug, lang, t, onDone, wait }: { slug: string; lang: Lang; t: T; onDone?: () => void; wait?: { minutes: number; note: string | null } | null }) {
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i)));
  }, []);
  const [day, setDay] = useState(dayKey(days[0]!));
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "null") as Partial<typeof form> | null;
      if (saved) setForm((f) => ({ ...f, name: saved.name ?? "", email: saved.email ?? "", phone: saved.phone ?? "" }));
    } catch {
      /* nothing saved */
    }
  }, []);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setTime(null);
    fetch(`/api/public/r/${slug}/reservations?date=${day}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Info>) : null))
      .then((d) => !gone && setInfo(d))
      .catch(() => !gone && setError("network"))
      .finally(() => !gone && setLoading(false));
    return () => {
      gone = true;
    };
  }, [slug, day]);

  const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { ...opts, timeZone: "UTC" }).format(d);
  const maxParty = info?.maxParty ?? 12;
  const ready = Boolean(time && form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.phone.replace(/\D/g, "").length >= 8);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !time) return;
    setSending(true);
    setError(null);
    try {
      localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: form.name, email: form.email, phone: form.phone }));
    } catch {
      /* private mode */
    }
    const res = await fetch("/api/public/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, deviceId: deviceId(), date: day, time, partySize: party, name: form.name, email: form.email, phone: form.phone, note: form.note || undefined, locale: lang }),
    }).catch(() => null);
    setSending(false);
    if (!res) return setError("network");
    const body = (await res.json().catch(() => ({}))) as Partial<Done> & { error?: string; field?: string };
    if (res.ok && body.ref) return setDone({ ref: body.ref, link: body.link ?? null, duplicate: Boolean(body.duplicate) });
    if (res.status === 429) return setError("rate");
    if (body.error === "invalid_input") return setError(body.field === "email" ? "email" : body.field === "phone" ? "phone" : "invalid");
    if (body.error === "slot" || body.error === "full") {
      // Taken meanwhile: reload the free times.
      setInfo((i) => (i ? { ...i, slots: i.slots.filter((s) => s.time !== time) } : i));
      setTime(null);
    }
    setError(body.error ?? "error");
  }

  if (done)
    return (
      <div className="flex flex-col gap-3 py-2 text-center" data-testid="reservation-done">
        <p className="text-4xl" aria-hidden>
          📅
        </p>
        <h3 className="text-xl font-extrabold">{t(done.duplicate ? "resvAlready" : "resvSent")}</h3>
        <p className="font-mono text-lg font-bold" data-testid="reservation-ref">
          {done.ref}
        </p>
        <p className="text-sm text-muted-foreground">{t("resvSentHint", { email: form.email })}</p>
        {done.link && (
          <a href={done.link} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border font-bold" data-testid="reservation-link">
            {t("resvSee")}
          </a>
        )}
        <button type="button" onClick={onDone} className="min-h-12 rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {t("resvBack")}
        </button>
      </div>
    );

  if (info && !info.open) return <p className="py-6 text-center text-muted-foreground">{t("resvClosed")}</p>;

  const input = "min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="reservation-form">
      {wait && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-950" data-testid="resv-wait">
          ⏳ {t("resvWait", { n: wait.minutes })}
          {wait.note ? ` · ${wait.note}` : ""}
        </p>
      )}
      {info?.note && <p className="rounded-xl bg-muted p-3 text-sm">{info.note}</p>}
      <fieldset>
        <legend className="mb-2 font-semibold">{t("resvDay")}</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup">
          {days.slice(0, Math.min(14, (info?.daysAhead ?? 30) + 1)).map((d, i) => {
            const k = dayKey(d);
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={day === k}
                onClick={() => setDay(k)}
                className={cn("flex min-h-14 min-w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 px-2 text-sm", day === k ? "font-bold" : "border-border")}
                style={day === k ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" } : undefined}
                data-testid="resv-day"
                data-day={k}
              >
                <span className="text-xs text-muted-foreground">{i === 0 ? t("resvToday") : i === 1 ? t("resvTomorrow") : fmtDay(d, { weekday: "short" })}</span>
                <span>{fmtDay(d, { day: "numeric", month: "short" })}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">{t("resvTime")}</legend>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("resvLoading")}</p>
        ) : !info || info.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="resv-no-slots">
            {t("resvNoSlots")}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup">
            {info.slots.map((s) => (
              <button
                key={s.time}
                type="button"
                role="radio"
                aria-checked={time === s.time}
                onClick={() => setTime(s.time)}
                className={cn("min-h-11 rounded-xl border-2 text-sm tabular-nums", time === s.time ? "font-bold" : "border-border")}
                style={time === s.time ? { borderColor: "var(--accent)", background: "var(--accent)", color: "var(--on-accent)" } : undefined}
                data-testid="resv-slot"
              >
                {s.time}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold" id="resv-party">
          {t("resvGuests")}
        </span>
        <div className="flex items-center gap-2" aria-labelledby="resv-party">
          <button type="button" onClick={() => setParty((p) => Math.max(1, p - 1))} className="h-11 w-11 rounded-full border border-border text-xl" aria-label={t("resvLess")}>
            −
          </button>
          <span className="w-8 text-center text-lg font-extrabold tabular-nums" data-testid="resv-party">
            {party}
          </span>
          <button type="button" onClick={() => setParty((p) => Math.min(maxParty, p + 1))} className="h-11 w-11 rounded-full border border-border text-xl" aria-label={t("resvMore")} data-testid="resv-party-plus">
            +
          </button>
        </div>
      </div>
      {party >= maxParty && <p className="-mt-2 text-xs text-muted-foreground">{t("resvBigGroup", { n: maxParty })}</p>}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("resvName")}
        <input required minLength={2} maxLength={60} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} data-testid="resv-name" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("resvEmail")}
        <input required type="email" maxLength={120} autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} data-testid="resv-email" />
        <span className="text-xs font-normal text-muted-foreground">{t("resvEmailHint")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("resvPhone")}
        <input required type="tel" maxLength={30} autoComplete="tel" inputMode="tel" placeholder="+226 70 00 00 00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} data-testid="resv-phone" />
        <span className="text-xs font-normal text-muted-foreground">{t("resvPhoneHint")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t("resvNote")}
        <textarea maxLength={300} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("resvNotePlaceholder")} className="w-full rounded-xl border border-border bg-surface p-3 text-base" data-testid="resv-note" />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" data-testid="resv-error">
          {t(`resvError_${error}`) === `resvError_${error}` ? t("resvError_error") : t(`resvError_${error}`)}
        </p>
      )}
      <button type="submit" disabled={!ready || sending} className="min-h-14 rounded-xl text-lg font-extrabold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="resv-submit">
        {sending ? t("sending") : `📅 ${t("resvSubmit")}`}
      </button>
      <p className="text-center text-xs text-muted-foreground">{t("resvPrivacy")}</p>
    </form>
  );
}

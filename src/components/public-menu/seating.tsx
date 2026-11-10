"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_INACTIVITY, inactivityState, type InactivityTimings } from "@/lib/seating/tables";
import type { makeT } from "@/lib/public-menu/translate";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof makeT>;
export type SeatType = "table" | "room" | "area" | "counter" | "takeaway" | "delivery";
export type MySeat = { sessionId: string; seat: { id: string; type: SeatType; label: string }; source: "qr" | "picker"; name?: string };
type PickerSeat = { id: string; type: SeatType; label: string; capacity: number | null; area: ({ fr: string } & Partial<Record<string, string>>) | null; occupied: boolean };

export type SeatingConfig = { enabled: boolean; pickerAvailable: boolean; inactivity: InactivityTimings };

function storeGet(kind: "local" | "session", key: string) {
  try {
    return (kind === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function storeSet(kind: "local" | "session", key: string, value: string | null) {
  try {
    const s = kind === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Anonymous id of this phone (no account needed). */
export function deviceId(): string {
  let id = storeGet("local", "rc-device");
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    storeSet("local", "rc-device", id);
  }
  return id;
}

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
}

/**
 * The customer's seat for this visit: from the printed table QR (token) or the picker.
 * Handles heartbeats and, in picker mode, inactivity release (works after the screen was off).
 */
export function useSeat({ slug, token, config, onToast, t, hold = false }: { slug: string; token: string | null; config: SeatingConfig; onToast: (m: string) => void; t: T; hold?: boolean }) {
  // Once an order is sent from this seat, inactivity no longer frees it.
  const holdRef = useRef(hold);
  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);
  const key = `rc-seat-${slug}`;
  const [seat, setSeatState] = useState<MySeat | null>(null);
  const [warning, setWarning] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const lastBeat = useRef(0);
  const ignoreNextTouch = useRef(false);
  const seatRef = useRef<MySeat | null>(null);

  const setSeat = useCallback(
    (s: MySeat | null) => {
      seatRef.current = s;
      setSeatState(s);
      storeSet("session", key, s ? JSON.stringify(s) : null);
    },
    [key],
  );

  const leave = useCallback(
    (reason: "released" | "inactive") => {
      const s = seatRef.current;
      if (!s) return;
      void post(`/api/public/sessions/${s.sessionId}/leave`, { slug, deviceId: deviceId(), reason }).catch(() => {});
      setSeat(null);
      setWarning(null);
    },
    [setSeat, slug],
  );

  // Restore (same visit) or join from the printed QR token.
  useEffect(() => {
    if (!config.enabled) return;
    const saved = (() => {
      try {
        return JSON.parse(storeGet("session", key) ?? "null") as MySeat | null;
      } catch {
        return null;
      }
    })();
    if (token) {
      void post("/api/public/sessions", { slug, deviceId: deviceId(), token })
        .then(async (res) => {
          if (!res.ok) {
            onToast(t("invalidQr"));
            return;
          }
          const body = (await res.json()) as { sessionId: string; seat: MySeat["seat"]; joined: boolean };
          if (saved && saved.sessionId !== body.sessionId && saved.source === "picker") {
            void post(`/api/public/sessions/${saved.sessionId}/leave`, { slug, deviceId: deviceId(), reason: "released" }).catch(() => {});
          }
          setSeat({ sessionId: body.sessionId, seat: body.seat, source: "qr" });
          if (body.joined) onToast(t("joinedTable"));
        })
        .catch(() => {});
      return;
    }
    if (saved) {
      seatRef.current = saved;
      setSeatState(saved);
      // Still valid? (released by inactivity or closed by staff while away)
      void post(`/api/public/sessions/${saved.sessionId}/heartbeat`, { slug, deviceId: deviceId() }).then((res) => {
        if (res.status === 410) setSeat(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page load
  }, []);

  // Activity tracking + inactivity release (picker seats only).
  useEffect(() => {
    if (!seat) return;
    const timings = config.inactivity ?? DEFAULT_INACTIVITY;
    const picker = seat.source === "picker";

    const beat = () => {
      const now = Date.now();
      if (now - lastBeat.current < 60_000) return;
      lastBeat.current = now;
      const s = seatRef.current;
      if (!s) return;
      void post(`/api/public/sessions/${s.sessionId}/heartbeat`, { slug, deviceId: deviceId() }).then((res) => {
        if (res.status === 410) {
          setSeat(null);
          onToast(t("released"));
        }
      });
    };

    const evaluate = () => {
      if (!picker || holdRef.current) {
        setWarning(null);
        return;
      }
      const st = inactivityState(lastActivity.current, Date.now(), timings);
      if (st.phase === "active") setWarning(null);
      else if (st.phase === "warning") setWarning(st.secondsLeft);
      else {
        leave("inactive");
        onToast(t("released"));
      }
    };

    const onActivity = (e: Event) => {
      // The touch that wakes the phone does not count as activity.
      if (ignoreNextTouch.current && e.type === "pointerdown") {
        ignoreNextTouch.current = false;
        return;
      }
      // While the warning shows, only the « Je suis là » button counts.
      if (picker && inactivityState(lastActivity.current, Date.now(), timings).phase !== "active") return;
      lastActivity.current = Date.now();
      beat();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      ignoreNextTouch.current = true;
      window.setTimeout(() => (ignoreNextTouch.current = false), 1500);
      evaluate(); // uses the real clock: timers may have been paused while the screen was off
    };

    lastActivity.current = Date.now();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(evaluate, 1000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [seat, config.inactivity, leave, onToast, setSeat, slug, t]);

  const stillHere = useCallback(() => {
    lastActivity.current = Date.now();
    lastBeat.current = 0;
    setWarning(null);
    const s = seatRef.current;
    if (s) void post(`/api/public/sessions/${s.sessionId}/heartbeat`, { slug, deviceId: deviceId() });
  }, [slug]);

  /** Join from the picker. Returns "occupied" when another phone has the seat and the customer did not choose « Rejoindre ». */
  const choose = useCallback(
    async (seatId: string, opts: { confirmJoin?: boolean; customerName?: string } = {}): Promise<"ok" | "occupied" | "error"> => {
      const res = await post("/api/public/sessions", { slug, deviceId: deviceId(), seatId, ...opts }).catch(() => null);
      if (!res) return "error";
      if (res.status === 409) return "occupied";
      if (!res.ok) return "error";
      const body = (await res.json()) as { sessionId: string; seat: MySeat["seat"]; joined: boolean };
      const prev = seatRef.current;
      if (prev && prev.sessionId !== body.sessionId) {
        void post(`/api/public/sessions/${prev.sessionId}/leave`, { slug, deviceId: deviceId(), reason: "released" }).catch(() => {});
      }
      lastActivity.current = Date.now();
      setSeat({ sessionId: body.sessionId, seat: body.seat, source: "picker", name: opts.customerName });
      if (body.joined) onToast(t("joinedTable"));
      return "ok";
    },
    [onToast, setSeat, slug, t],
  );

  /** The server says this phone is no longer seated (session closed): forget the seat. */
  const forget = useCallback(() => setSeat(null), [setSeat]);

  return { seat, warning, stillHere, choose, leave, forget };
}

/* ---------------- UI ---------------- */

export function SeatBadge({ seat, t, onChange }: { seat: MySeat; t: T; onChange: (() => void) | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-1 pl-3 text-sm font-bold" data-testid="seat-badge">
      📍 {t(`seat_${seat.seat.type}`)} {["table", "room", "area"].includes(seat.seat.type) ? seat.seat.label : ""}
      {seat.name ? ` · ${seat.name}` : ""}
      {onChange && (
        <button type="button" onClick={onChange} className="min-h-9 rounded-full bg-muted px-3 text-xs font-semibold">
          {t("changeSeat")}
        </button>
      )}
    </span>
  );
}

/** Distinctive designs: gold coin (tables), red lacquer plate (rooms), green tag (everything else). */
function SeatToken({ s, t, lang }: { s: PickerSeat; t: T; lang: string }) {
  const area = s.area ? s.area[lang] || s.area.fr : null;
  if (s.type === "table") {
    return (
      <span className="flex flex-col items-center gap-1">
        <span
          className="font-display flex h-16 w-16 items-center justify-center rounded-full text-2xl font-extrabold text-encre shadow-md ring-4 ring-[#c99a1f]/50"
          style={{ background: "radial-gradient(circle at 35% 30%, #fbe39a, #E9B530 55%, #b98a12)" }}
        >
          {s.label}
        </span>
        {area && <span className="text-[11px] text-muted-foreground">{area}</span>}
      </span>
    );
  }
  if (s.type === "room") {
    return (
      <span
        className="flex min-h-16 min-w-28 flex-col items-center justify-center rounded-2xl border-2 border-[#E9B530] px-3 text-center text-creme shadow-md"
        style={{ background: "linear-gradient(145deg, #8f1d14, #B24A26)" }}
      >
        <span className="text-[11px] tracking-wide uppercase opacity-80">{t("seat_room")}</span>
        <span className="font-display text-lg leading-tight font-extrabold">{s.label}</span>
      </span>
    );
  }
  const icon = s.type === "takeaway" ? "🛍️" : s.type === "delivery" ? "🛵" : s.type === "counter" ? "🛎️" : "🌿";
  return (
    <span className="relative flex min-h-12 items-center gap-2 rounded-lg bg-vert py-2 pr-4 pl-6 font-bold text-creme shadow-md">
      <span className="absolute top-1/2 left-2 h-2 w-2 -translate-y-1/2 rounded-full bg-creme/80" aria-hidden />
      <span aria-hidden>{icon}</span>
      {s.type === "area" ? s.label : t(`seat_${s.type}`)}
    </span>
  );
}

export function SeatPicker({ slug, lang, t, onChoose, onClose }: { slug: string; lang: string; t: T; onChoose: (id: string, o?: { confirmJoin?: boolean; customerName?: string }) => Promise<"ok" | "occupied" | "error">; onClose: () => void }) {
  const [seats, setSeats] = useState<PickerSeat[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [occupied, setOccupied] = useState<PickerSeat | null>(null);
  const [counter, setCounter] = useState<PickerSeat | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    fetch(`/api/public/r/${slug}/seats`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { seats: PickerSeat[] }) => setSeats(b.seats))
      .catch(() => setFailed(true));
  }, [slug]);
  useEffect(load, [load]);

  async function pick(s: PickerSeat, opts: { confirmJoin?: boolean; customerName?: string } = {}) {
    if (s.type === "counter" && !opts.customerName) return setCounter(s);
    setBusy(true);
    setError(false);
    const res = await onChoose(s.id, opts);
    setBusy(false);
    if (res === "occupied") setOccupied(s);
    else if (res === "error") setError(true);
    else onClose();
  }

  const groups = (["table", "room", "area", "counter", "takeaway", "delivery"] as const)
    .map((type) => ({ type, list: (seats ?? []).filter((s) => s.type === type) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("seatTitle")}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-4 sm:rounded-3xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        data-testid="seat-picker"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold">{t("seatTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="h-11 w-11 rounded-full text-2xl hover:bg-muted">
            ×
          </button>
        </div>

        {occupied ? (
          <div className="flex flex-col gap-3 text-center" role="alertdialog" aria-label={t("occupiedTitle")} data-testid="occupied-dialog">
            <p className="text-4xl" aria-hidden>
              ⚠️
            </p>
            <p className="font-display text-lg font-extrabold">{t("occupiedTitle")}</p>
            <p className="text-muted-foreground">{t("occupiedText")}</p>
            <button type="button" disabled={busy} onClick={() => pick(occupied, { confirmJoin: true })} className="min-h-12 rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              {t("join")}
            </button>
            <button type="button" onClick={() => setOccupied(null)} className="min-h-12 rounded-xl border border-border font-semibold">
              {t("chooseOther")}
            </button>
          </div>
        ) : counter ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void pick(counter, { customerName: name.trim() });
            }}
          >
            <label>
              <span className="mb-1 block font-semibold">{t("counterName")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" required className="h-12 w-full rounded-xl border border-border bg-surface px-3" />
            </label>
            <p className="text-sm text-muted-foreground">{t("counterHint")}</p>
            <button type="submit" disabled={busy} className="min-h-12 rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              {t("confirm")}
            </button>
          </form>
        ) : seats === null && !failed ? (
          <p className="py-8 text-center text-muted-foreground">{t("loadingSeats")}</p>
        ) : seats === null ? (
          // Loading failed (weak network): say so and offer a retry, not « no seats ».
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert" data-testid="seats-error">
            <p className="text-muted-foreground">{t("seatsLoadError")}</p>
            <button type="button" onClick={load} className="min-h-11 rounded-full border border-border px-5 font-semibold">
              {t("retry")}
            </button>
          </div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t("noSeats")}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.type}>
                <h3 className="mb-2 font-semibold">{t(`group_${g.type}`)}</h3>
                <div className="flex flex-wrap gap-3">
                  {g.list.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => pick(s)}
                      className={cn("relative rounded-2xl p-1 focus-visible:outline-3", s.occupied && "opacity-60")}
                      aria-label={`${t(`seat_${s.type}`)} ${s.label}${s.occupied ? ` (${t("occupied")})` : ""}`}
                      data-testid="picker-seat"
                    >
                      <SeatToken s={s} t={t} lang={lang} />
                      {s.occupied && (
                        <span className="absolute -top-1 -right-1 rounded-full bg-laterite px-2 py-0.5 text-[10px] font-bold text-creme">{t("occupied")}</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-center text-sm text-danger">
            {t("seatError")}
          </p>
        )}
      </div>
    </div>
  );
}

export function StillThere({ seconds, t, onStay }: { seconds: number; t: T; onStay: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" role="alertdialog" aria-modal="true" aria-label={t("stillThere")} data-testid="still-there">
      <div className="max-w-sm rounded-3xl bg-background p-6 text-center shadow-2xl">
        <p className="font-display text-2xl font-extrabold">{t("stillThere")}</p>
        <p className="mt-2 text-muted-foreground" aria-live="polite">
          {t("stillThereText", { seconds })}
        </p>
        <button type="button" onClick={onStay} className="mt-4 min-h-12 w-full rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
          {t("imHere")}
        </button>
      </div>
    </div>
  );
}

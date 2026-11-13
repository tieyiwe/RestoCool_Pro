"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatFCFA } from "@/lib/format";
import { lineMatchesMenu, unitPrice } from "@/lib/public-menu/cart";
import type { makeT } from "@/lib/public-menu/translate";
import type { CartLine, PublicItem } from "@/lib/public-menu/types";
import { cn } from "@/lib/utils";
import { deviceId } from "./seating";

type T = ReturnType<typeof makeT>;
type Lang = "fr" | "en" | "zh";
const pick = (x: { fr: string } & Partial<Record<string, string>>, lang: Lang) => x[lang] || x.fr;

export type SharedMember = { id: string; name: string | null; lines: CartLine[]; done: boolean; host: boolean; mine: boolean };
export type SharedView = {
  status: "open" | "sent" | "closed";
  hostName: string | null;
  isHost: boolean;
  order: { code: string | null; number: number } | null;
  members: SharedMember[];
};

const hostKey = (slug: string) => `rc-share-${slug}`;
const NAME_KEY = "rc-share-name";
function storeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function storeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}
export const rememberedName = () => storeGet(NAME_KEY) ?? "";

const toWire = (lines: CartLine[]) =>
  lines.map((l) => ({ key: l.key, itemId: l.itemId, variantId: l.variantId, optionIds: l.optionIds, qty: l.qty, ...(l.note ? { note: l.note } : {}) }));
const sigOf = (lines: CartLine[]) => JSON.stringify(lines.map((l) => [l.itemId, l.variantId, l.optionIds, l.qty, l.note ?? ""]));

/**
 * « Sélection partagée ». Host: the person who started (their name is required); their phone keeps
 * the link token (localStorage). Guest: opened the link (?partage=TOKEN), gives their name first,
 * then adds their own dishes and says « J'ai terminé ». Everyone sees who picked what; only the
 * host sends the order (seat, takeaway, « Montrer au serveur »).
 */
export function useSharedSelection(slug: string) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<"none" | "host" | "guest">("none");
  const [view, setView] = useState<SharedView | null>(null);
  const [ended, setEnded] = useState<null | "sent" | "closed" | "gone">(null);

  useEffect(() => {
    const guest = new URLSearchParams(window.location.search).get("partage");
    if (guest && /^[A-Za-z0-9_-]{16,64}$/.test(guest)) {
      setToken(guest);
      setRole("guest");
      return;
    }
    const mine = storeGet(hostKey(slug));
    if (mine) {
      setToken(mine);
      setRole("host");
    }
  }, [slug]);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/public/shared-carts/${token}?slug=${encodeURIComponent(slug)}&deviceId=${encodeURIComponent(deviceId())}`, { cache: "no-store" }).catch(() => null);
    if (!res) return; // offline: keep what we have
    if (res.status === 404) {
      setView(null);
      setEnded("gone");
      if (role === "host") storeSet(hostKey(slug), null);
      setToken(null);
      setRole("none");
      return;
    }
    if (!res.ok) return;
    const v = (await res.json()) as SharedView;
    // The host opened their own link: host view.
    if (v.isHost && role === "guest") setRole("host");
    if (v.status !== "open" && v.isHost) {
      storeSet(hostKey(slug), null);
      setToken(null);
      setRole("none");
      setView(null);
      setEnded(v.status);
      return;
    }
    setView(v);
    if (v.status !== "open") setEnded(v.status);
  }, [token, slug, role]);

  // Live enough: every 4 s while shared (and right away when the page comes back).
  useEffect(() => {
    if (!token) return;
    void load();
    const id = window.setInterval(() => document.visibilityState === "visible" && void load(), 4000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, load]);

  /** Host: start sharing (new link), with their name and current dishes. */
  const start = useCallback(
    async (hostName: string, lines: CartLine[]): Promise<string | null> => {
      storeSet(NAME_KEY, hostName);
      const res = await fetch("/api/public/shared-carts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, deviceId: deviceId(), hostName, lines: toWire(lines) }),
      }).catch(() => null);
      if (!res?.ok) return null;
      const { token: tk } = (await res.json()) as { token: string };
      storeSet(hostKey(slug), tk);
      setToken(tk);
      setRole("host");
      setEnded(null);
      setView({ status: "open", hostName, isHost: true, order: null, members: [{ id: "me", name: hostName, lines, done: false, host: true, mine: true }] });
      return tk;
    },
    [slug],
  );

  /** Host: order sent (orderId) or sharing stopped (null). */
  const finish = useCallback(
    async (orderId: string | null) => {
      const tk = token ?? storeGet(hostKey(slug));
      if (!tk) return;
      storeSet(hostKey(slug), null);
      setToken(null);
      setRole("none");
      setView(null);
      await fetch(`/api/public/shared-carts/${tk}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, deviceId: deviceId(), orderId }),
      }).catch(() => null);
    },
    [token, slug],
  );

  /** Save my part: name (required), dishes, and whether I am done (guests). */
  const saveMine = useCallback(
    async (lines: CartLine[], name: string, done: boolean) => {
      if (!token || role === "none" || !name.trim()) return false;
      storeSet(NAME_KEY, name.trim());
      const res = await fetch(`/api/public/shared-carts/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, deviceId: deviceId(), name: name.trim(), done, lines: toWire(lines) }),
      }).catch(() => null);
      if (res?.ok) await load();
      return Boolean(res?.ok);
    },
    [token, role, slug, load],
  );

  const open = view?.status === "open";
  const me = view?.members.find((m) => m.mine) ?? null;
  /** Everyone else's dishes (on the host's phone they join the order), keys unique per person. */
  const others = open ? (view?.members.filter((m) => !m.mine) ?? []) : [];
  const guestLines: CartLine[] = role === "host" ? others.flatMap((m) => m.lines.map((l) => ({ ...l, key: `${m.id}:${l.key}` }))) : [];

  return {
    token,
    role,
    view,
    open,
    me,
    others,
    ended,
    start,
    finish,
    saveMine,
    guestLines,
    reload: load,
    shareUrl: token && typeof window !== "undefined" ? `${window.location.origin}/r/${slug}?partage=${token}` : null,
  };
}
export type Shared = ReturnType<typeof useSharedSelection>;

/** Keeps my dishes saved on the shared selection while I add or remove them (host and guests). */
export function useAutoSave(shared: Shared, lines: CartLine[]) {
  const last = useRef<string | null>(null);
  const name = shared.me?.name ?? "";
  const serverSig = shared.me ? sigOf(shared.me.lines) : null;
  useEffect(() => {
    if (!shared.open || !name || serverSig === null) return;
    // First time: compare with what the server already has for me.
    if (last.current === null) last.current = serverSig;
    const sig = sigOf(lines);
    if (sig === last.current) return;
    const id = window.setTimeout(() => {
      last.current = sig;
      // A guest who changes their dishes is choosing again (no longer « terminé »).
      void shared.saveMine(lines, name, false);
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save on dish changes only
  }, [lines, shared.open, name, serverSig === null]);
}

function share(url: string, text: string, title: string) {
  const wa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
  if (navigator.share) {
    navigator.share({ title, text, url }).catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "AbortError") wa();
    });
    return;
  }
  wa();
}

/** One person's dishes in the shared selection. */
function MemberCard({ m, items, lang, t }: { m: SharedMember; items: Map<string, PublicItem>; lang: Lang; t: T }) {
  const lines = m.lines.filter((l) => lineMatchesMenu(items, l));
  const sub = lines.reduce((s, l) => s + (unitPrice(items.get(l.itemId)!, l.variantId, l.optionIds) ?? 0) * l.qty, 0);
  return (
    <li className="rounded-lg bg-muted p-2 text-sm" data-testid="share-member" data-done={m.done} data-name={m.name ?? ""}>
      <p className="flex items-center justify-between gap-2 font-semibold">
        <span>
          {m.name || t("shareGuest")}
          {m.host && <span className="ml-1 text-xs font-normal text-muted-foreground">· {t("shareHostTag")}</span>}
        </span>
        {!m.host && (
          <span className={cn("rounded-full px-2 text-xs", m.done ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-950")}>
            {m.done ? `✓ ${t("shareDone")}` : `… ${t("shareChoosing")}`}
          </span>
        )}
      </p>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("shareNothingYet")}</p>
      ) : (
        <ul>
          {lines.map((l) => (
            <li key={l.key}>
              {l.qty} × {pick(items.get(l.itemId)!.name, lang)}
              {l.note ? <span className="text-muted-foreground"> « {l.note} »</span> : null}
            </li>
          ))}
        </ul>
      )}
      {sub > 0 && <p className="text-xs font-bold tabular-nums">{formatFCFA(sub)}</p>}
    </li>
  );
}

/** Host side of the cart: share the selection (name first), then see each guest's dishes live. */
export function HostShare({
  shared,
  lines,
  items,
  lang,
  t,
  businessName,
}: {
  shared: Shared;
  lines: CartLine[];
  items: Map<string, PublicItem>;
  lang: Lang;
  t: T;
  businessName: string;
}) {
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setName(rememberedName()), []);

  if (shared.role === "guest") return null;
  if (shared.role !== "host" || !shared.open) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-border p-3" data-testid="share-selection">
        {!asking ? (
          <button type="button" onClick={() => setAsking(true)} className="flex min-h-11 w-full items-center justify-center gap-2 font-bold" data-testid="share-start">
            👥 {t("shareStart")}
          </button>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return;
              setBusy(true);
              setError(false);
              const tk = await shared.start(n, lines);
              setBusy(false);
              if (!tk) return setError(true);
              const base = window.location.pathname.match(/^\/r\/[^/]+/)?.[0] ?? "";
              share(`${window.location.origin}${base}?partage=${tk}`, t("shareText", { business: businessName, name: n }), businessName);
            }}
          >
            <p className="text-sm">{t("shareExplain")}</p>
            <label className="text-sm font-semibold" htmlFor="share-host-name">
              {t("shareYourName")}
            </label>
            <input
              id="share-host-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              autoComplete="given-name"
              placeholder={t("shareNamePlaceholder")}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-base"
              data-testid="share-host-name"
            />
            <button type="submit" disabled={busy || !name.trim()} className="min-h-11 rounded-xl bg-[#25D366] font-bold text-white disabled:opacity-60" data-testid="share-create">
              💬 {t("shareCreate")}
            </button>
            {error && <p className="text-sm text-red-600">{t("shareError")}</p>}
          </form>
        )}
      </div>
    );
  }

  const guests = shared.others;
  const text = t("shareText", { business: businessName, name: shared.view?.hostName ?? "" });
  return (
    <div className="mt-3 rounded-xl border-2 border-[#25D366]/60 p-3" data-testid="share-live">
      <p className="font-bold">👥 {t("shareLiveTitle")}</p>
      <p className="text-xs text-muted-foreground">{guests.length === 0 ? t("shareWaiting") : t("shareCount", { n: guests.length, done: guests.filter((m) => m.done).length })}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {guests.map((m) => (
          <MemberCard key={m.id} m={m} items={items} lang={lang} t={t} />
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => shared.shareUrl && share(shared.shareUrl, text, businessName)} className="min-h-11 flex-1 rounded-xl bg-[#25D366] px-3 text-sm font-bold text-white" data-testid="share-again">
          💬 {t("shareAgain")}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!shared.shareUrl) return;
            await navigator.clipboard?.writeText(shared.shareUrl).catch(() => {});
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
          className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold"
          data-testid="share-copy"
        >
          {copied ? `✓ ${t("shareCopied")}` : `🔗 ${t("shareCopy")}`}
        </button>
        <button type="button" onClick={() => void shared.finish(null)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold" data-testid="share-stop">
          {t("shareStop")}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("shareHostOnly")}</p>
    </div>
  );
}

/**
 * Guest: a name step before anything can be added (so everyone sees who picks what).
 * Shown until the name is saved.
 */
export function GuestNameGate({ shared, t, businessName }: { shared: Shared; t: T; businessName: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(rememberedName()), []);
  if (shared.role !== "guest" || !shared.view || !shared.open || shared.me?.name) return null;
  const host = shared.view.hostName || t("shareHostDefault");
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="guest-gate-title" data-testid="guest-name-gate">
      <form
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-foreground shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          await shared.saveMine([], name.trim(), false);
          setBusy(false);
        }}
      >
        <p className="text-3xl" aria-hidden>
          👥
        </p>
        <h2 id="guest-gate-title" className="text-lg font-extrabold">
          {t("shareGateTitle", { host, business: businessName })}
        </h2>
        <p className="text-sm text-muted-foreground">{t("shareGateHint")}</p>
        <label className="text-sm font-semibold" htmlFor="guest-name">
          {t("shareYourName")}
        </label>
        <input
          id="guest-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
          autoFocus
          autoComplete="given-name"
          placeholder={t("shareNamePlaceholder")}
          className="min-h-12 rounded-xl border border-border bg-background px-3 text-base"
          data-testid="guest-name"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="min-h-12 rounded-xl text-base font-extrabold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          data-testid="guest-name-ok"
        >
          {t("shareGateGo")}
        </button>
      </form>
    </div>
  );
}

/**
 * Guest side of the cart: what the others picked, « J'ai terminé mes choix » (or change them
 * again). My dishes are saved automatically while I add them. Only the host sends the order.
 */
export function GuestShare({ shared, lines, items, lang, t }: { shared: Shared; lines: CartLine[]; items: Map<string, PublicItem>; lang: Lang; t: T }) {
  const [busy, setBusy] = useState(false);
  if (shared.role !== "guest") return null;
  const host = shared.view?.hostName || t("shareHostDefault");
  if (shared.view && !shared.open)
    return (
      <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" data-testid="share-sent">
        ✅ {shared.view.status === "sent" ? t("shareSentBy", { host }) : t("shareClosedBy", { host })}
      </p>
    );
  const done = shared.me?.done ?? false;
  const name = shared.me?.name ?? "";
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border-2 border-[#25D366]/60 p-3" data-testid="guest-share">
      <p className="font-bold">👥 {t("shareGuestTitle", { host })}</p>
      <p className="text-xs text-muted-foreground">{t("shareGuestHint", { host, name })}</p>
      {done ? (
        <>
          <p className="rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" data-testid="guest-done">
            ✓ {t("shareGuestDone", { host })}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await shared.saveMine(lines, name, false);
              setBusy(false);
            }}
            className="min-h-11 rounded-xl border border-border text-sm font-semibold"
            data-testid="guest-edit"
          >
            {t("shareEditChoices")}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy || lines.length === 0}
          onClick={async () => {
            setBusy(true);
            await shared.saveMine(lines, name, true);
            setBusy(false);
          }}
          className="min-h-12 rounded-xl text-base font-extrabold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          data-testid="guest-finish"
        >
          ✓ {t("shareFinish")}
        </button>
      )}
      {shared.others.length > 0 && (
        <>
          <p className="mt-1 text-sm font-semibold">{t("shareOthersTitle")}</p>
          <ul className="flex flex-col gap-2">
            {shared.others.map((m) => (
              <MemberCard key={m.id} m={m} items={items} lang={lang} t={t} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A thin bar under the header while this phone is a guest. */
export function GuestBanner({ shared, t }: { shared: Shared; t: T }) {
  if (shared.role !== "guest" || !shared.view) return null;
  const host = shared.view.hostName || t("shareHostDefault");
  return (
    <p className="bg-[#25D366] px-4 py-1.5 text-center text-xs font-bold text-white" data-testid="guest-banner">
      👥 {shared.open ? t("shareBanner", { host, name: shared.me?.name ?? "" }) : shared.view.status === "sent" ? t("shareSentBy", { host }) : t("shareClosedBy", { host })}
    </p>
  );
}

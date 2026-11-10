"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBfPhone, formatFCFA, telHref, whatsappHref } from "@/lib/format";
import { addToCart, cartTotals, changeQty, indexItems, lineMatchesMenu, qtyForItem, takeawayMessage, unitPrice } from "@/lib/public-menu/cart";
import { openStatus } from "@/lib/public-menu/hours";
import { itemMatches } from "@/lib/public-menu/search";
import { makeT, type Messages } from "@/lib/public-menu/translate";
import type { CartLine, PublicItem, PublicMenuData } from "@/lib/public-menu/types";
import { cn } from "@/lib/utils";
import { HistoryList, OrderDetailsFields, OrdersList, sendOrder, ServedCelebration, ShowToServer, useHistory, useLiveOrders, type CustomerOrder } from "./orders";
import { deviceId, SeatBadge, SeatPicker, StillThere, useSeat, type SeatingConfig } from "./seating";

type Lang = "fr" | "en" | "zh";
type Panel =
  | { type: "variant"; itemId: string }
  | { type: "cart" }
  | { type: "takeaway" }
  | { type: "share" }
  | { type: "orders" }
  | { type: "history" }
  | { type: "server"; orderId: string }
  | { type: "fortune"; index: number }
  | { type: "lightbox"; index: number };

const LANG_LABEL: Record<Lang, string> = { fr: "FR", en: "EN", zh: "中文" };

/* ---------- storage helpers (private mode / blocked storage must not break the menu) ---------- */
function readStore(kind: "session" | "local", key: string): string | null {
  try {
    return (kind === "session" ? sessionStorage : localStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStore(kind: "session" | "local", key: string, value: string | null) {
  try {
    const s = kind === "session" ? sessionStorage : localStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Stored carts come from the browser: keep only well-formed lines (a bad one would crash the menu). */
function isCartLine(x: unknown): x is CartLine {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.key === "string" &&
    typeof l.itemId === "string" &&
    (l.variantId === null || typeof l.variantId === "string") &&
    Array.isArray(l.optionIds) &&
    l.optionIds.every((o) => typeof o === "string") &&
    Number.isInteger(l.qty) &&
    (l.qty as number) >= 1 &&
    (l.qty as number) <= 99 &&
    (l.note === undefined || (typeof l.note === "string" && l.note.length <= 140))
  );
}

const pick = (t: { fr: string } & Partial<Record<string, string>> | null | undefined, lang: Lang) => (t ? t[lang]?.trim() || t.fr : "");
const soldOutIds = (d: PublicMenuData) => d.categories.flatMap((c) => c.items.filter((i) => i.soldOut).map((i) => i.id));

export function MenuApp({
  data: initialData,
  messages,
  whatsappQr,
  seatToken = null,
  seating,
}: {
  data: PublicMenuData;
  messages: Record<Lang, Messages>;
  whatsappQr: string | null;
  /** Token from a printed table QR (/r/{slug}/t/{token}). */
  seatToken?: string | null;
  seating: SeatingConfig;
}) {
  // Live « épuisé » (sold out / hidden) from the restaurant, applied over the server-rendered menu.
  const [liveSoldOut, setLiveSoldOut] = useState<Set<string> | null>(null);
  const data = useMemo(
    () =>
      liveSoldOut
        ? { ...initialData, categories: initialData.categories.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, soldOut: liveSoldOut.has(i.id) })) })) }
        : initialData,
    [initialData, liveSoldOut],
  );
  // French on every new visit; the choice lasts for this visit only (sessionStorage).
  const [lang, setLang] = useState<Lang>("fr");
  const [lowData, setLowData] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ spicy: false, local: false, isNew: false });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(data.categories[0]?.id ?? null);
  const [showTop, setShowTop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const hydrated = useRef(false);
  const t = useMemo(() => makeT(messages[lang]), [messages, lang]);
  const items = useMemo(() => indexItems(data), [data]);
  const baseItems = useMemo(() => indexItems(initialData), [initialData]);
  const cartKey = `rc-cart-${initialData.slug}`;
  const history = useHistory(initialData.slug, isCartLine);
  const { startVisit, rememberCart } = history;

  /* ---------- restore per-visit state ---------- */
  useEffect(() => {
    const l = readStore("session", "rc-lang");
    if (l === "en" || l === "zh") setLang(data.locales.includes(l) ? l : "fr");
    setLowData(readStore("local", "rc-lowdata") === "1");
    const stored = readStore("session", cartKey);
    // A new visit starts with an empty cart; last visit's cart goes to « Sélections précédentes ».
    startVisit(stored === null);
    try {
      const saved: unknown = JSON.parse(stored ?? "[]");
      if (Array.isArray(saved)) setLines(saved.filter((x): x is CartLine => isCartLine(x) && lineMatchesMenu(baseItems, x)));
    } catch {
      /* ignore */
    }
    if (initialData.features.welcomeScreen && !initialData.preview && readStore("session", `rc-welcome-${initialData.slug}`) !== "1") {
      setWelcome(true);
      writeStore("session", `rc-welcome-${initialData.slug}`, "1");
    }
    setNow(new Date());
    hydrated.current = true;
  }, [cartKey, initialData, baseItems, startVisit]);

  useEffect(() => {
    if (!hydrated.current) return;
    writeStore("session", cartKey, JSON.stringify(lines));
    rememberCart(lines);
  }, [lines, cartKey, rememberCart]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
  }, [lang]);

  /* ---------- welcome screen: closes by itself after ~3 s ---------- */
  useEffect(() => {
    if (!welcome) return;
    const id = window.setTimeout(() => setWelcome(false), 3000);
    return () => window.clearTimeout(id);
  }, [welcome]);

  /* ---------- panels + phone back button ---------- */
  // One history entry per open panel stack, so the phone's back button closes it.
  // (Kept out of the setState updater: updaters must be pure and may run twice.)
  const panelRef = useRef<Panel | null>(null);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);
  const openPanel = useCallback((p: Panel) => {
    if (panelRef.current) window.history.replaceState({ rcPanel: true }, "");
    else window.history.pushState({ rcPanel: true }, "");
    panelRef.current = p;
    setPanel(p);
  }, []);
  const closePanel = useCallback(() => {
    if ((window.history.state as { rcPanel?: boolean } | null)?.rcPanel) window.history.back();
    else setPanel(null);
  }, []);
  useEffect(() => {
    const onPop = () => setPanel(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  /* ---------- scroll: active category + back-to-top ---------- */
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.getAttribute("data-cat"));
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    document.querySelectorAll("[data-cat]").forEach((el) => io.observe(el));
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [query, filters]);
  useEffect(() => {
    document.getElementById(`tab-${activeCat}`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeCat]);

  /* ---------- offline + updates (service worker scoped to /r/) ---------- */
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/r/sw.js", { scope: "/r/" })
      .then((r) => {
        reg = r;
        void r.update();
      })
      .catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && void reg?.update();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const toastTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const show = () => !navigator.onLine && flash(t("offline"));
    window.addEventListener("offline", show);
    return () => window.removeEventListener("offline", show);
  }, [flash, t]);

  const [picker, setPicker] = useState(false);
  /* ---------- orders: send, live tracking, table bill ---------- */
  const trackKey = `rc-ordered-${initialData.slug}`;
  const [tracking, setTracking] = useState(false);
  useEffect(() => {
    const at = Number(readStore("local", trackKey) ?? 0);
    setTracking(Date.now() - at < 24 * 3600_000);
  }, [trackKey]);
  const [served, setServed] = useState(false);
  const [sending, setSending] = useState(false);
  const [details, setDetails] = useState({ customerName: "", customerPhone: "", deliveryAddress: "" });
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [heldSeat, setHeldSeat] = useState(false);
  const { seat, warning, stillHere, choose, forget } = useSeat({ slug: data.slug, token: seatToken, config: seating, onToast: flash, t, hold: heldSeat });
  const refreshAvailability = useCallback(async () => {
    const res = await fetch(`/api/public/r/${initialData.slug}/availability`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setLiveSoldOut(new Set(((await res.json()) as { soldOut: string[] }).soldOut));
  }, [initialData.slug]);
  const sessionIdForCheck = seat?.sessionId ?? null;
  const onSessionChange = useCallback(() => {
    // Closed by staff: the heartbeat answers 410 and the seat is forgotten.
    if (!sessionIdForCheck) return;
    void fetch(`/api/public/sessions/${sessionIdForCheck}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: initialData.slug, deviceId: deviceId() }),
    }).then((r) => r.status === 410 && forget());
  }, [sessionIdForCheck, initialData.slug, forget]);
  const onServed = useCallback(() => setServed(true), []);
  const live = useLiveOrders({
    slug: data.slug,
    sessionId: seat?.sessionId ?? null,
    active: seating.enabled && (seat !== null || tracking),
    onMenuChange: refreshAvailability,
    onSessionChange,
    onServed,
  });
  const myOrders = live.orders;
  const activeOrders = myOrders.filter((o) => o.mine && ["sent", "confirmed", "preparing", "ready"].includes(o.status));
  useEffect(() => {
    // Only an order sent from this seat holds it (not one from an earlier visit today).
    setHeldSeat(Boolean(seat && myOrders.some((o) => o.mine && o.current && o.status !== "cancelled")));
  }, [seat, myOrders]);

  async function submitOrder() {
    if (!seat) {
      if (seating.pickerAvailable) {
        closePanel();
        setPicker(true);
      }
      flash(t(seating.pickerAvailable ? "chooseSeatFirst" : "scanTableFirst"));
      return;
    }
    const valid = lines.filter((l) => lineMatchesMenu(items, l));
    if (valid.length === 0) return;
    setSending(true);
    const res = await sendOrder(data.slug, seat, valid, {
      customerName: details.customerName || seat.name,
      customerPhone: details.customerPhone,
      deliveryAddress: details.deliveryAddress,
    });
    setSending(false);
    if (res.ok) {
      history.addOrder(res.order.number, valid);
      setLines([]);
      writeStore("local", trackKey, String(Date.now()));
      setTracking(true);
      live.setOrders((o) => [res.order, ...o.filter((x) => x.id !== res.order.id)]);
      void live.refresh();
      openPanel({ type: "orders" });
      flash(t("orderSent", { n: res.order.number }));
      return;
    }
    if (res.error === "unavailable") {
      // The live set replaces the server-rendered flags: start from them, never from nothing.
      setLiveSoldOut((prev) => new Set([...(prev ?? soldOutIds(initialData)), ...res.itemIds]));
      setLines((l) => l.filter((x) => !res.itemIds.includes(x.itemId)));
      flash(t("orderUnavailable"));
    } else if (res.error === "no_seat") {
      forget();
      flash(t(seating.pickerAvailable ? "chooseSeatFirst" : "scanTableFirst"));
    } else if (res.error === "name_required" || res.error === "delivery_required") flash(t("orderDetailsMissing"));
    else if (res.error === "network") flash(t("orderOffline"));
    else flash(t("orderError"));
  }
  // A seat set by scanning the table's own QR stays (the phone is at that table); picker seats can change.
  const canChangeSeat = seating.pickerAvailable && seat?.source !== "qr";

  /* ---------- derived ---------- */
  const filtering = query.trim() !== "" || filters.spicy || filters.local || filters.isNew;
  const categories = useMemo(
    () =>
      data.categories
        .map((c) => ({
          ...c,
          items: c.items.filter(
            (i) =>
              itemMatches(i, query) &&
              (!filters.spicy || i.spicy > 0) &&
              (!filters.local || i.tags.includes("local")) &&
              (!filters.isNew || i.tags.includes("new")),
          ),
        }))
        .filter((c) => c.items.length > 0),
    [data.categories, query, filters],
  );
  const photos = useMemo(() => (lowData ? [] : categories.flatMap((c) => c.items).filter((i) => i.photoUrl)), [categories, lowData]);
  const totals = cartTotals(items, lines);
  const status = now ? openStatus(data.hours, now) : null;
  const accentStyle = { ["--accent" as string]: data.accent, ["--on-accent" as string]: data.onAccent } as React.CSSProperties;

  function add(item: PublicItem) {
    if (item.soldOut) return;
    if (item.variants.length > 0 || item.options.length > 0) openPanel({ type: "variant", itemId: item.id });
    else setLines((l) => addToCart(l, item.id));
  }
  function decrementItem(item: PublicItem) {
    const last = [...lines].reverse().find((l) => l.itemId === item.id);
    if (last) setLines((l) => changeQty(l, last.key, -1));
  }
  function setLanguage(l: Lang) {
    setLang(l);
    writeStore("session", "rc-lang", l === "fr" ? null : l);
  }
  function toggleLowData() {
    setLowData((v) => {
      writeStore("local", "rc-lowdata", v ? null : "1");
      return !v;
    });
  }
  async function share() {
    const url = window.location.href.split("#")[0]!;
    if (navigator.share) {
      try {
        await navigator.share({ title: data.name, url });
        return;
      } catch {
        /* cancelled or unavailable: fall back to the sheet */
      }
    }
    openPanel({ type: "share" });
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(t("copied"));
    } catch {
      /* ignore */
    }
  }

  return (
    <div data-menu-theme={data.theme} style={accentStyle} className="min-h-dvh bg-background pb-28 text-foreground">
      {data.preview && <p className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">{t("preview")}</p>}

      {/* ---------- Header ---------- */}
      <header className="relative">
        {data.coverUrl && !lowData && (
          // eslint-disable-next-line @next/next/no-img-element -- compressed WebP from our media route
          <img src={data.coverUrl} alt="" className="h-40 w-full object-cover sm:h-56" fetchPriority="high" />
        )}
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-5 pb-3">
          {data.logoUrl && !lowData && (
            // eslint-disable-next-line @next/next/no-img-element -- small logo
            <img src={data.logoUrl} alt="" width={56} height={56} className="h-14 w-14 rounded-xl border border-border bg-surface object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl leading-tight font-extrabold">{data.name}</h1>
            {data.description && <p className="text-sm text-muted-foreground">{pick(data.description, lang)}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{data.city}</span>
              {status && (
                <a href="#contact" className={cn("rounded-full px-2 py-0.5 text-xs font-bold", status.open ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900")} data-testid="open-status">
                  {status.open ? t("openNow") : t("closedNow")}
                  {status.open && status.closesAt ? ` · ${t("closesAt", { time: status.closesAt })}` : ""}
                  {!status.open && status.opensAt ? ` · ${t("opensAt", { time: status.opensAt })}` : ""}
                </a>
              )}
            </p>
            {seating.enabled && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {seat ? (
                  <SeatBadge seat={seat} t={t} onChange={canChangeSeat ? () => setPicker(true) : null} />
                ) : (
                  seating.pickerAvailable && (
                    <button
                      type="button"
                      onClick={() => setPicker(true)}
                      className="min-h-11 rounded-full px-4 text-sm font-bold"
                      style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                      data-testid="choose-seat"
                    >
                      📍 {t("chooseSeat")}
                    </button>
                  )
                )}
                {myOrders.length > 0 && (
                  <button type="button" onClick={() => openPanel({ type: "orders" })} className="min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-bold" data-testid="my-orders-button">
                    🧾 {t("myOrders")}
                    {activeOrders.length > 0 && <span className="ml-1 rounded-full bg-[var(--accent)] px-1.5 text-xs text-[var(--on-accent)]">{activeOrders.length}</span>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- Sticky bar: search, filters, language, share + category tabs ---------- */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pt-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-full border border-border bg-surface pr-3 pl-9"
              data-testid="menu-search"
            />
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden>
              ⌕
            </span>
          </label>
          {data.locales.length > 1 && (
            <div role="group" aria-label={t("language")} className="flex shrink-0 rounded-full border border-border bg-surface p-0.5">
              {data.locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  aria-pressed={lang === l}
                  className="h-10 min-w-10 rounded-full px-2 text-xs font-bold aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--on-accent)]"
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          )}
          {data.features.share && (
            <button type="button" onClick={share} aria-label={t("share")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface" data-testid="share-button">
              <ShareIcon />
            </button>
          )}
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
          <Chip on={filters.spicy} onClick={() => setFilters((f) => ({ ...f, spicy: !f.spicy }))}>
            🌶️ {t("filterSpicy")}
          </Chip>
          <Chip on={filters.isNew} onClick={() => setFilters((f) => ({ ...f, isNew: !f.isNew }))}>
            ✨ {t("filterNew")}
          </Chip>
          {data.features.localBadge && (
            <Chip on={filters.local} onClick={() => setFilters((f) => ({ ...f, local: !f.local }))}>
              🌿 {t("filterLocal")}
            </Chip>
          )}
          <Chip on={lowData} onClick={toggleLowData} title={t("lowDataHint")}>
            📶 {t("lowData")}
          </Chip>
        </div>
        {!filtering && (
          <nav aria-label={t("categories")} className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {categories.map((c) => (
              <a
                key={c.id}
                id={`tab-${c.id}`}
                href={`#cat-${c.id}`}
                aria-current={activeCat === c.id ? "true" : undefined}
                className="flex min-h-11 shrink-0 items-center rounded-full bg-muted px-4 text-sm font-semibold aria-[current=true]:bg-[var(--accent)] aria-[current=true]:text-[var(--on-accent)]"
              >
                {pick(c.name, lang)}
              </a>
            ))}
          </nav>
        )}
      </div>

      {/* ---------- Dishes ---------- */}
      <main className="mx-auto max-w-3xl px-3">
        {categories.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <p>{t("noResults")}</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilters({ spicy: false, local: false, isNew: false });
              }}
              className="mt-3 min-h-11 rounded-full border border-border px-4 font-semibold"
            >
              {t("resetFilters")}
            </button>
          </div>
        )}
        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} data-cat={c.id} className="scroll-mt-40 pt-5">
            <h2 className="font-display mb-2 px-1 text-xl font-extrabold" style={{ color: "var(--accent)" }}>
              {pick(c.name, lang)}
            </h2>
            <ul className="flex flex-col gap-2">
              {c.items.map((item) => (
                <DishCard
                  key={item.id}
                  item={item}
                  lang={lang}
                  t={t}
                  lowData={lowData}
                  qty={qtyForItem(lines, item.id)}
                  onAdd={() => add(item)}
                  onRemove={() => decrementItem(item)}
                  onPhoto={() => {
                    const i = photos.findIndex((p) => p.id === item.id);
                    if (i >= 0) openPanel({ type: "lightbox", index: i });
                  }}
                />
              ))}
            </ul>
          </section>
        ))}

        {/* ---------- Contact ---------- */}
        <Contact data={data} dayNames={(messages[lang].days as string[] | undefined) ?? []} t={t} status={status} now={now} whatsappQr={lowData ? null : whatsappQr} onCopy={copy} />

        {data.features.fortuneCookie && (
          <div className="my-6 text-center">
            <button
              type="button"
              onClick={() => openPanel({ type: "fortune", index: Math.floor(Math.random() * data.fortunes.length) })}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-[var(--accent)] px-5 font-bold"
              data-testid="fortune-button"
            >
              🥠 {t("fortune")}
            </button>
          </div>
        )}

        {data.poweredBadge && (
          <footer className="safe-bottom flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- 24px brand icon */}
            <img src="/brand/png/app-icon-192.png" alt="" width={24} height={24} className="h-6 w-6 rounded-[22%]" loading="lazy" />
            <span>
              {t("poweredBy")}{" "}
              <a href="https://restocool.com" className="font-semibold underline-offset-2 hover:underline">
                RestoCool
              </a>{" "}
              · {t("poweredBy2")}{" "}
              <a href="https://tiblogics.com" className="font-semibold underline-offset-2 hover:underline">
                TIBLOGICS
              </a>{" "}
              ·{" "}
              <a href="/privacy" className="underline-offset-2 hover:underline">
                {t("privacy")}
              </a>
            </span>
          </footer>
        )}
      </main>

      {/* ---------- Bottom bar: Ma sélection ---------- */}
      {totals.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={() => openPanel({ type: "cart" })}
            className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between rounded-2xl px-4 font-bold shadow-xl"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            data-testid="cart-bar"
          >
            <span className="flex items-center gap-2">
              {t("mySelection")}
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-sm">{totals.count}</span>
            </span>
            <span className="tabular-nums" data-testid="cart-total">
              {/* Only « sur demande » dishes: never show « 0 F ». */}
              {totals.total === 0 && totals.hasOnRequest ? t("onRequest") : `${formatFCFA(totals.total)}${totals.hasOnRequest ? " +" : ""}`}
            </span>
          </button>
        </div>
      )}

      {totals.count === 0 && activeOrders.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={() => openPanel({ type: "orders" })}
            className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between rounded-2xl border-2 border-[var(--accent)] bg-surface px-4 font-bold shadow-xl"
            data-testid="orders-bar"
          >
            <span>🧾 {t("myOrders")}</span>
            <span className="text-sm">{t(`status_${activeOrders[0]!.status}`)}</span>
          </button>
        </div>
      )}

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("backToTop")}
          className={cn("fixed right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface shadow-lg", totals.count > 0 ? "bottom-24" : "bottom-4")}
        >
          ↑
        </button>
      )}

      {toast && (
        <p role="status" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-sm text-white">
          {toast}
        </p>
      )}

      {/* ---------- Panels ---------- */}
      {panel?.type === "variant" && items.get(panel.itemId) && (
        <VariantSheet
          item={items.get(panel.itemId)!}
          lang={lang}
          t={t}
          onClose={closePanel}
          onConfirm={(variantId, optionIds) => {
            setLines((l) => addToCart(l, panel.itemId, variantId, optionIds));
            closePanel();
          }}
        />
      )}
      {panel?.type === "cart" && (
        <Sheet title={t("mySelection")} onClose={closePanel} t={t} testId="cart-sheet">
          {history.entries.length > 0 && (
            <button type="button" onClick={() => openPanel({ type: "history" })} className="mb-2 min-h-11 text-sm font-semibold underline underline-offset-2" data-testid="history-link">
              🕘 {t("previousSelections")} ({history.entries.length})
            </button>
          )}
          {lines.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">{t("emptySelection")}</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border">
                {lines.map((l) => {
                  const item = items.get(l.itemId);
                  if (!item) return null;
                  const variant = item.variants.find((v) => v.id === l.variantId);
                  const opts = item.options.filter((o) => l.optionIds.includes(o.id));
                  const p = unitPrice(item, l.variantId, l.optionIds);
                  return (
                    <li key={l.key} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {item.code && <span className="text-muted-foreground">{item.code}. </span>}
                          {pick(item.name, lang)}
                        </p>
                        {(variant || opts.length > 0) && (
                          <p className="text-sm text-muted-foreground">{[variant && pick(variant.name, lang), ...opts.map((o) => pick(o.name, lang))].filter(Boolean).join(", ")}</p>
                        )}
                        <p className="text-sm tabular-nums">{p === null ? t("onRequest") : formatFCFA(p * l.qty)}</p>
                        {seating.enabled &&
                          (noteFor === l.key ? (
                            <input
                              autoFocus
                              defaultValue={l.note ?? ""}
                              maxLength={140}
                              placeholder={t("notePlaceholder")}
                              aria-label={t("noteLabel")}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                setLines((x) => x.map((y) => (y.key === l.key ? { ...y, note: v || undefined } : y)));
                                setNoteFor(null);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-2 text-base"
                              data-testid="line-note"
                            />
                          ) : (
                            <button type="button" onClick={() => setNoteFor(l.key)} className="min-h-11 text-left text-sm text-muted-foreground underline-offset-2 hover:underline" data-testid="add-note">
                              {l.note ? `« ${l.note} »` : `+ ${t("noteLabel")}`}
                            </button>
                          ))}
                      </div>
                      <Stepper qty={l.qty} t={t} name={pick(item.name, lang)} onMinus={() => setLines((x) => changeQty(x, l.key, -1))} onPlus={() => setLines((x) => changeQty(x, l.key, 1))} />
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 flex justify-between border-t border-border pt-3 text-lg font-extrabold">
                <span>{t("total")}</span>
                <span className="tabular-nums">{totals.total === 0 && totals.hasOnRequest ? t("onRequest") : formatFCFA(totals.total)}</span>
              </p>
              {totals.hasOnRequest && <p className="text-sm text-muted-foreground">{t("plusOnRequest")}</p>}
              {seating.enabled ? (
                <>
                  {seat && <OrderDetailsFields seat={seat} t={t} values={details} onChange={(v) => setDetails((d) => ({ ...d, ...v }))} />}
                  {seat && <p className="mt-3 text-sm text-muted-foreground">{t("orderFor", { seat: `${t(`seat_${seat.seat.type}`)} ${["table", "room", "area"].includes(seat.seat.type) ? seat.seat.label : ""}`.trim() })}</p>}
                </>
              ) : (
                <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{t("showWaiterHint")}</p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                {seating.enabled && (
                  <button
                    type="button"
                    onClick={() => void submitOrder()}
                    disabled={sending || data.preview}
                    className="min-h-14 rounded-xl text-lg font-extrabold disabled:opacity-60"
                    style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                    data-testid="send-order"
                  >
                    {sending ? t("sending") : seat ? `✓ ${t("sendOrder")}` : `📍 ${t(seating.pickerAvailable ? "chooseSeatToOrder" : "scanTableFirst")}`}
                  </button>
                )}
                {data.features.takeawayWhatsapp && (
                  <button
                    type="button"
                    onClick={() => openPanel({ type: "takeaway" })}
                    className={cn("min-h-12 rounded-xl font-bold", seating.enabled && "border border-border")}
                    style={seating.enabled ? undefined : { background: "var(--accent)", color: "var(--on-accent)" }}
                  >
                    🛍️ {t("takeaway")}
                  </button>
                )}
                <button type="button" onClick={() => setLines([])} className="min-h-11 rounded-xl border border-border font-semibold">
                  {t("clear")}
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}
      {panel?.type === "orders" && (
        <Sheet title={t("myOrders")} onClose={closePanel} t={t} testId="orders-sheet">
          <OrdersList orders={myOrders} shared={live.shared} lang={lang} t={t} onShow={(o: CustomerOrder) => openPanel({ type: "server", orderId: o.id })} />
        </Sheet>
      )}
      {panel?.type === "server" && myOrders.find((o) => o.id === panel.orderId) && (
        <ShowToServer order={myOrders.find((o) => o.id === panel.orderId)!} slug={data.slug} lang={lang} t={t} onClose={closePanel} />
      )}
      {panel?.type === "history" && (
        <Sheet title={t("previousSelections")} onClose={closePanel} t={t} testId="history-sheet">
          <HistoryList
            entries={history.entries}
            lang={lang}
            t={t}
            describe={(l) => {
              const it = items.get(l.itemId);
              return it && lineMatchesMenu(items, l) ? `${l.qty} × ${pick(it.name, lang)}` : null;
            }}
            onReuse={(e) => {
              const ok = e.lines.filter((l) => lineMatchesMenu(items, l) && !items.get(l.itemId)?.soldOut);
              setLines((cur) => {
                const merged = [...cur];
                for (const l of ok) {
                  const i = merged.findIndex((m) => m.key === l.key);
                  if (i >= 0) merged[i] = { ...merged[i]!, qty: Math.min(99, merged[i]!.qty + l.qty) };
                  else merged.push(l);
                }
                return merged;
              });
              flash(ok.length < e.lines.length ? t("reusedPartly") : t("reused"));
              openPanel({ type: "cart" });
            }}
            onDelete={history.remove}
          />
        </Sheet>
      )}
      {served && <ServedCelebration t={t} onClose={() => setServed(false)} />}
      {panel?.type === "takeaway" && data.whatsapp && (
        <TakeawaySheet
          t={t}
          onClose={closePanel}
          onSend={(name, pickup) => {
            const href = whatsappHref(data.whatsapp!, takeawayMessage(data, items, lines, { name, pickup }));
            if (href) window.open(href, "_blank", "noopener");
          }}
        />
      )}
      {panel?.type === "share" && (
        <Sheet title={t("shareTitle")} onClose={closePanel} t={t}>
          <div className="grid gap-2">
            {(() => {
              const url = typeof window === "undefined" ? "" : window.location.href.split("#")[0]!;
              return (
                <>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`${data.name} · ${url}`)}`} target="_blank" rel="noopener" className="flex min-h-12 items-center justify-center rounded-xl bg-[#25D366] font-bold text-black">
                    WhatsApp
                  </a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener" className="flex min-h-12 items-center justify-center rounded-xl bg-[#1877F2] font-bold text-white">
                    Facebook
                  </a>
                  <button type="button" onClick={() => copy(url)} className="min-h-12 rounded-xl border border-border font-bold">
                    {t("copyLink")}
                  </button>
                </>
              );
            })()}
          </div>
        </Sheet>
      )}
      {panel?.type === "fortune" && data.fortunes.length > 0 && (
        <Sheet title={`🥠 ${t("fortune")}`} onClose={closePanel} t={t} testId="fortune-sheet">
          <p className="font-display py-6 text-center text-xl leading-snug font-bold">« {pick(data.fortunes[panel.index % data.fortunes.length], lang)} »</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPanel({ type: "fortune", index: (panel.index + 1 + Math.floor(Math.random() * (data.fortunes.length - 1))) % data.fortunes.length })}
              className="min-h-11 rounded-xl border border-border font-semibold"
            >
              {t("fortuneAgain")}
            </button>
            <button
              type="button"
              onClick={async () => {
                const text = `🥠 ${pick(data.fortunes[panel.index % data.fortunes.length], lang)} · ${data.name}`;
                if (navigator.share) await navigator.share({ text }).catch(() => {});
                else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
              className="min-h-11 rounded-xl font-semibold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {t("fortuneShare")}
            </button>
          </div>
        </Sheet>
      )}
      {panel?.type === "lightbox" && photos[panel.index] && (
        <Lightbox
          photos={photos}
          index={panel.index}
          lang={lang}
          t={t}
          onIndex={(i) => setPanel({ type: "lightbox", index: i })}
          onClose={closePanel}
        />
      )}

      {picker && <SeatPicker slug={data.slug} lang={lang} t={t} onChoose={choose} onClose={() => setPicker(false)} />}
      {warning !== null && <StillThere seconds={warning} t={t} onStay={stillHere} />}
      {welcome && <Welcome name={data.name} t={t} onClose={() => setWelcome(false)} />}
    </div>
  );
}

/* ====================================================================== */

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-sm font-semibold whitespace-nowrap aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--on-accent)]"
    >
      {children}
    </button>
  );
}

function DishCard({
  item,
  lang,
  t,
  lowData,
  qty,
  onAdd,
  onRemove,
  onPhoto,
}: {
  item: PublicItem;
  lang: Lang;
  t: ReturnType<typeof makeT>;
  lowData: boolean;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  onPhoto: () => void;
}) {
  const name = pick(item.name, lang);
  // The original name in the other languages, so staff can read any order.
  const others = (["fr", "en", "zh"] as const).filter((l) => l !== lang && item.name[l] && item.name[l] !== name).map((l) => ({ l, v: item.name[l]! }));
  const price =
    item.variants.length > 0 ? item.variants.map((v) => formatFCFA(v.price)).join(" / ") : (formatFCFA(item.price) ?? t("onRequest"));
  const badges = item.tags.filter((x) => ["new", "chef", "vegetarian", "local", "peanuts", "shellfish", "eggs"].includes(x));
  const chooser = item.variants.length > 0 || item.options.length > 0;
  return (
    <li className={cn("flex gap-3 rounded-2xl border border-border bg-surface p-2.5", item.soldOut && "opacity-60")} data-testid="menu-item">
      {item.thumbUrl && !lowData && (
        <button type="button" onClick={onPhoto} className="shrink-0" aria-label={t("photo", { name })}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 168px WebP thumbnail, lazy */}
          <img src={item.thumbUrl} alt="" width={84} height={84} loading="lazy" decoding="async" className="h-21 w-21 rounded-xl object-cover" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="leading-snug font-bold">
          {item.code && <span className="mr-1 text-muted-foreground">{item.code}.</span>}
          <span data-testid="dish-name">{name}</span>
          {item.spicy > 0 && (
            <span className="ml-1" role="img" aria-label={t("spicy")}>
              {"🌶️".repeat(item.spicy)}
            </span>
          )}
        </p>
        {others.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {others.map((o, i) => (
              <span key={o.l} lang={o.l === "zh" ? "zh-Hans" : o.l}>
                {i > 0 && " · "}
                {o.v}
              </span>
            ))}
          </p>
        )}
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{pick(item.description, lang)}</p>}
        {(badges.length > 0 || item.soldOut) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.soldOut && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-900">{t("soldOut")}</span>}
            {badges.map((b) => (
              <span key={b} className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", b === "new" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground")}>
                {t(b)}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="font-bold tabular-nums">{price}</p>
          {!item.soldOut &&
            (qty > 0 && !chooser ? (
              <Stepper qty={qty} t={t} name={name} onMinus={onRemove} onPlus={onAdd} />
            ) : (
              <button
                type="button"
                onClick={onAdd}
                aria-label={t("add", { name })}
                className="relative flex h-11 min-w-11 items-center justify-center rounded-full text-xl font-bold"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                data-testid="add-button"
              >
                +
                {qty > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-foreground px-1.5 text-xs text-background">{qty}</span>}
              </button>
            ))}
        </div>
      </div>
    </li>
  );
}

function Stepper({ qty, t, name, onMinus, onPlus }: { qty: number; t: ReturnType<typeof makeT>; name: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <span className="flex items-center rounded-full border border-border">
      <button type="button" onClick={onMinus} aria-label={`${t("decrease")} · ${name}`} className="h-11 w-11 text-xl font-bold">
        −
      </button>
      <span className="min-w-6 text-center font-bold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button type="button" onClick={onPlus} aria-label={`${t("increase")} · ${name}`} className="h-11 w-11 text-xl font-bold">
        +
      </button>
    </span>
  );
}

function Sheet({ title, onClose, t, testId, children }: { title: string; onClose: () => void; t: ReturnType<typeof makeT>; testId?: string; children: React.ReactNode }) {
  // Keyboard and screen-reader users land in the dialog, and go back where they were on close.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-4 sm:rounded-3xl outline-none"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        data-testid={testId}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="h-11 w-11 rounded-full text-2xl hover:bg-muted">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function VariantSheet({
  item,
  lang,
  t,
  onClose,
  onConfirm,
}: {
  item: PublicItem;
  lang: Lang;
  t: ReturnType<typeof makeT>;
  onClose: () => void;
  onConfirm: (variantId: string | null, optionIds: string[]) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(item.variants[0]?.id ?? null);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof item.options>();
    for (const o of item.options) m.set(o.group.fr, [...(m.get(o.group.fr) ?? []), o]);
    return [...m.values()];
  }, [item]);
  const price = unitPrice(item, variantId, optionIds);
  return (
    <Sheet title={pick(item.name, lang)} onClose={onClose} t={t} testId="variant-sheet">
      {item.variants.length > 0 && (
        <fieldset className="mb-4">
          <legend className="mb-2 font-semibold">{t("chooseTitle")}</legend>
          <div className="grid gap-2">
            {item.variants.map((v) => (
              <label key={v.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-border px-4 has-checked:border-[var(--accent)]">
                <span className="flex items-center gap-3">
                  <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} className="h-5 w-5" />
                  {pick(v.name, lang)}
                </span>
                <span className="font-bold tabular-nums">{formatFCFA(v.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {groups.map((g) => (
        <fieldset key={g[0]!.id} className="mb-4">
          <legend className="mb-2 font-semibold">{pick(g[0]!.group, lang)}</legend>
          <div className="grid gap-2">
            {g.map((o) => (
              <label key={o.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-border px-4 has-checked:border-[var(--accent)]">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={optionIds.includes(o.id)}
                    onChange={(e) =>
                      // One choice per group.
                      setOptionIds((ids) => (e.target.checked ? [...ids.filter((id) => !g.some((x) => x.id === id)), o.id] : ids.filter((id) => id !== o.id)))
                    }
                    className="h-5 w-5"
                  />
                  {pick(o.name, lang)}
                </span>
                {o.priceDelta !== 0 && <span className="tabular-nums">+{formatFCFA(o.priceDelta)}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => onConfirm(variantId, optionIds)}
        className="min-h-12 w-full rounded-xl font-bold"
        style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        data-testid="variant-confirm"
      >
        {price === null ? t("addToSelectionNoPrice") : t("addToSelection", { price: formatFCFA(price)! })}
      </button>
    </Sheet>
  );
}

function TakeawaySheet({ t, onClose, onSend }: { t: ReturnType<typeof makeT>; onClose: () => void; onSend: (name: string, pickup: string) => void }) {
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [error, setError] = useState(false);
  return (
    <Sheet title={t("takeawayTitle")} onClose={onClose} t={t} testId="takeaway-sheet">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError(true);
          onSend(name.trim(), pickup);
        }}
      >
        <label>
          <span className="mb-1 block text-sm font-semibold">{t("yourName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} className="h-12 w-full rounded-xl border border-border bg-surface px-3" aria-invalid={error || undefined} />
          {error && (
            <span className="text-sm text-danger" role="alert">
              {t("nameRequired")}
            </span>
          )}
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">{t("pickupTime")}</span>
          <input type="time" value={pickup} onChange={(e) => setPickup(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-surface px-3" />
        </label>
        <button type="submit" className="min-h-12 rounded-xl bg-[#25D366] font-bold text-black">
          {t("sendWhatsapp")}
        </button>
      </form>
    </Sheet>
  );
}

function Lightbox({
  photos,
  index,
  lang,
  t,
  onIndex,
  onClose,
}: {
  photos: PublicItem[];
  index: number;
  lang: Lang;
  t: ReturnType<typeof makeT>;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const item = photos[index]!;
  const go = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, photos.length, onIndex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("photo", { name: pick(item.name, lang) })}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 text-white"
      style={{ opacity: 1 - Math.min(dragY, 300) / 400 }}
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerMove={(e) => start.current && setDragY(Math.max(0, e.clientY - start.current.y))}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        setDragY(0);
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose(); // swipe down closes
        else if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); // swipe left/right
      }}
      data-testid="lightbox"
    >
      <button type="button" onClick={onClose} aria-label={t("close")} className="absolute top-3 right-3 h-12 w-12 rounded-full bg-white/10 text-3xl" style={{ marginTop: "env(safe-area-inset-top)" }}>
        ×
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- full photo (max 1200px WebP) */}
      <img src={item.photoUrl!} alt={pick(item.name, lang)} className="max-h-[75dvh] max-w-full touch-none object-contain select-none" draggable={false} style={{ transform: `translateY(${dragY}px)` }} />
      <p className="mt-3 px-4 text-center font-bold">
        {item.code && `${item.code}. `}
        {pick(item.name, lang)}
      </p>
      <p className="text-sm opacity-70">
        {index + 1} / {photos.length}
      </p>
      {photos.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label={t("prevPhoto")} className="absolute top-1/2 left-2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/10 text-2xl">
            ‹
          </button>
          <button type="button" onClick={() => go(1)} aria-label={t("nextPhoto")} className="absolute top-1/2 right-2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/10 text-2xl">
            ›
          </button>
        </>
      )}
    </div>
  );
}

function Welcome({ name, t, onClose }: { name: string; t: ReturnType<typeof makeT>; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={t("welcome", { name })} onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" data-testid="welcome">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="demo-confetti"
            style={{
              left: `${(i * 29) % 100}%`,
              background: ["#E9B530", "#0F6B3E", "#B24A26", "#FFF8EC", "#2F7DD1"][i % 5],
              animationDelay: `${(i % 9) * 0.1}s`,
              animationDuration: `${1.8 + (i % 5) * 0.3}s`,
            }}
          />
        ))}
      </div>
      <div className="demo-pop relative max-w-sm rounded-3xl bg-background p-8 text-center shadow-2xl">
        <p className="text-5xl" aria-hidden>
          🍽️
        </p>
        <p className="font-display mt-2 text-2xl leading-tight font-extrabold">{t("welcome", { name })}</p>
        <p className="mt-2 text-muted-foreground">{t("welcomeSub")}</p>
      </div>
    </div>
  );
}

function Contact({
  data,
  dayNames: dayNamesFor,
  t,
  status,
  now,
  whatsappQr,
  onCopy,
}: {
  data: PublicMenuData;
  dayNames: string[];
  t: ReturnType<typeof makeT>;
  status: ReturnType<typeof openStatus> | null;
  now: Date | null;
  whatsappQr: string | null;
  onCopy: (text: string) => void;
}) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const today = now?.getUTCDay();
  const dayNames = dayNamesFor;
  const wa = data.whatsapp ? whatsappHref(data.whatsapp) : null;
  const pay: Array<[string, string]> = [
    ...(data.orangeMoney ? [[t("orangeMoney"), data.orangeMoney] as [string, string]] : []),
    ...(data.moovMoney ? [[t("moovMoney"), data.moovMoney] as [string, string]] : []),
  ];
  return (
    <section id="contact" className="mt-8 scroll-mt-40 rounded-2xl border border-border bg-surface p-4" aria-labelledby="contact-title">
      <h2 id="contact-title" className="font-display mb-3 text-xl font-extrabold">
        {t("contact")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          {data.phones.map((p) => (
            <a key={p} href={telHref(p)} className="flex min-h-11 items-center gap-2 font-semibold">
              📞 <span className="underline-offset-2 hover:underline">{formatBfPhone(p)}</span>
            </a>
          ))}
          {wa && (
            <a href={wa} target="_blank" rel="noopener" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-black">
              {t("whatsapp")}
            </a>
          )}
          {pay.map(([label, num]) => (
            <div key={label} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2">
              <span>
                <span className="block text-xs text-muted-foreground">{label}</span>
                <span className="font-bold tabular-nums">{formatBfPhone(num)}</span>
              </span>
              <button type="button" onClick={() => onCopy(num.replace(/^226/, ""))} className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold">
                {t("copy")}
              </button>
            </div>
          ))}
          {data.address && (
            <p>
              <span className="block text-xs text-muted-foreground">{t("address")}</span>
              {data.address.toLowerCase().includes(data.city.toLowerCase()) ? data.address : `${data.address}, ${data.city}`}
            </p>
          )}
          {data.gmapsUrl && (
            <a href={data.gmapsUrl} target="_blank" rel="noopener" className="flex min-h-11 items-center font-semibold underline underline-offset-2">
              📍 {t("directions")}
            </a>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {data.hours.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-2 font-semibold">
                {t("hours")}
                {status && <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", status.open ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900")}>{status.open ? t("openNow") : t("closedNow")}</span>}
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {order.map((d) => {
                    const hs = data.hours.filter((h) => h.weekday === d);
                    return (
                      <tr key={d} className={cn(d === today && "font-bold")}>
                        <td className="py-0.5 pr-2">
                          {dayNames[d]}
                          {d === today && <span className="sr-only"> ({t("today")})</span>}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">{hs.length ? hs.map((h) => `${h.opens}–${h.closes}`).join(", ") : t("closed")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {whatsappQr && (
            <figure className="flex items-center gap-3">
              <div className="w-24 shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: whatsappQr }} />
              <figcaption className="text-sm text-muted-foreground">{t("scanWhatsapp")}</figcaption>
            </figure>
          )}
        </div>
      </div>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

"use client";

import { cn } from "@/lib/utils";

/**
 * Animated mock-ups for the « Guide ». Each scene draws a simplified screen for one step and
 * says where the finger taps (x/y in %). Plain divs + CSS: no video, no extra download.
 */
export type GuideId =
  | "menu"
  | "qr"
  | "publish"
  | "service"
  | "soldout"
  | "staff"
  | "analytics"
  | "checkin"
  | "confirm"
  | "serve"
  | "scan"
  | "kitchen"
  | "rc"
  | "reservations"
  | "waitTime"
  | "resvCheckin"
  | "releaseTable"
  | "reviews"
  | "sharedOrder"
  | "offline";

/**
 * Who a tutorial is for. The owner sees every profile (to train the team or show a screen);
 * managers see their team's profiles; others see their own.
 */
export const PROFILES = ["owner", "manager", "server", "host", "kitchen"] as const;
export type Profile = (typeof PROFILES)[number];
/** Kept for older imports. */
export type Audience = Profile;

export const GUIDES: Array<{ id: GuideId; profiles: Profile[]; steps: number; icon: string; href: string | null }> = [
  { id: "menu", profiles: ["owner", "manager"], steps: 4, icon: "🍽️", href: "/app/menu" },
  { id: "qr", profiles: ["owner", "manager"], steps: 4, icon: "🔳", href: "/app/seating" },
  { id: "publish", profiles: ["owner"], steps: 3, icon: "🚀", href: "/app/settings#publish" },
  { id: "staff", profiles: ["owner", "manager"], steps: 4, icon: "👥", href: "/app/staff" },
  { id: "reservations", profiles: ["owner", "manager", "host"], steps: 4, icon: "📅", href: "/app/reservations" },
  { id: "waitTime", profiles: ["owner", "manager", "host"], steps: 3, icon: "⏳", href: "/app/reservations" },
  { id: "reviews", profiles: ["owner", "manager"], steps: 3, icon: "⭐", href: "/app/reviews" },
  { id: "analytics", profiles: ["owner", "manager"], steps: 3, icon: "📊", href: "/app" },
  { id: "service", profiles: ["owner", "manager", "server"], steps: 4, icon: "🛎️", href: "/app/service" },
  { id: "confirm", profiles: ["manager", "server", "host"], steps: 3, icon: "✅", href: "/app/service" },
  { id: "serve", profiles: ["server"], steps: 3, icon: "🍛", href: "/app/service" },
  { id: "releaseTable", profiles: ["owner", "manager", "server"], steps: 3, icon: "🪑", href: "/app/service" },
  { id: "sharedOrder", profiles: ["server", "kitchen", "host"], steps: 3, icon: "👥", href: null },
  { id: "resvCheckin", profiles: ["manager", "server", "host"], steps: 3, icon: "🎟️", href: "/app/scan" },
  { id: "scan", profiles: ["server", "host"], steps: 3, icon: "📱", href: null },
  { id: "kitchen", profiles: ["kitchen"], steps: 4, icon: "👩🏾‍🍳", href: "/app/kitchen" },
  { id: "soldout", profiles: ["manager", "server", "kitchen"], steps: 3, icon: "🚫", href: "/app/kitchen" },
  { id: "offline", profiles: ["manager", "server", "kitchen", "host"], steps: 3, icon: "📶", href: null },
  { id: "checkin", profiles: ["manager", "server", "host", "kitchen"], steps: 4, icon: "🕘", href: "/pointage" },
  { id: "rc", profiles: ["server", "host"], steps: 3, icon: "🔢", href: "/c" },
];

/** The tutorials of a profile; the owner's list is every tutorial. */
export const guidesFor = (p: Profile) => (p === "owner" ? GUIDES : GUIDES.filter((g) => g.profiles.includes(p)));

type Scene = { screen: React.ReactNode; tap?: { x: number; y: number }; device?: "phone" | "tablet" };

/* ---------- tiny building blocks ---------- */

const Bar = ({ title, dark }: { title: string; dark?: boolean }) => (
  <div className={cn("flex items-center justify-between px-3 py-2 text-[11px] font-bold", dark ? "bg-[#0B3D26] text-[#FFF8EC]" : "bg-[#0F6B3E] text-white")}>
    <span>{title}</span>
    <span className="opacity-70">RestoCool</span>
  </div>
);
const Btn = ({ children, on, tone = "green", className }: { children: React.ReactNode; on?: boolean; tone?: "green" | "gold" | "red" | "ghost"; className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-transform",
      tone === "green" && "bg-[#0F6B3E] text-white",
      tone === "gold" && "bg-[#E9B530] text-[#17231C]",
      tone === "red" && "bg-[#9E2B25] text-white",
      tone === "ghost" && "border border-[#E8DCC7] bg-white text-[#17231C]",
      on && "demo-pulse scale-105",
      className,
    )}
  >
    {children}
  </span>
);
const Dish = ({ name, price, out, isNew, outLabel = "" }: { name: string; price: string; out?: boolean; isNew?: boolean; outLabel?: string }) => (
  <div className={cn("flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm", isNew && "demo-pop ring-2 ring-[#E9B530]")}>
    <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#B24A26] to-[#E9B530]" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[11px] font-bold text-[#17231C]">{name}</span>
      <span className="text-[10px] text-[#5B6B60]">{price}</span>
    </span>
    {out ? <span className="rounded-full bg-red-100 px-1.5 text-[9px] font-bold text-red-900">{outLabel}</span> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0F6B3E] text-xs text-white">+</span>}
  </div>
);
const Seat = ({ label }: { label: string }) => (
  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E9B530] text-sm font-extrabold text-[#17231C] ring-2 ring-[#F6D77A]">{label}</span>
);
const OrderCard = ({ seat, status, pop, children, no = "" }: { seat: string; status: string; pop?: boolean; children?: React.ReactNode; no?: string }) => (
  <div className={cn("flex flex-col gap-1 rounded-xl border border-[#E8DCC7] bg-white p-2 shadow-sm", pop && "demo-pop border-2 border-[#E9B530]")}>
    <div className="flex items-center justify-between">
      <Seat label={seat} />
      <span className="text-[10px] font-bold text-[#17231C]">{no} · {status}</span>
    </div>
    <span className="text-[10px] text-[#17231C]">2 × Riz gras · 1 × Bissap</span>
    {children}
  </div>
);
const Field = ({ label, value, focus }: { label: string; value: string; focus?: boolean }) => (
  <div>
    <span className="text-[9px] font-bold text-[#5B6B60]">{label}</span>
    <div className={cn("rounded-lg border bg-white px-2 py-1 text-[11px] text-[#17231C]", focus ? "border-[#0F6B3E] ring-2 ring-[#0F6B3E]/20" : "border-[#E8DCC7]")}>
      {value}
      {focus && <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#17231C] align-middle" />}
    </div>
  </div>
);
const Col = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-lg bg-[#F6EEDF] p-1.5">
    <span className="text-[9px] font-bold text-[#17231C]">{title}</span>
    {children}
  </div>
);

/* ---------- scenes ---------- */

export function sceneFor(id: GuideId, step: number, L: (k: string) => string): Scene {
  const body = (children: React.ReactNode, cls = "") => <div className={cn("flex flex-1 flex-col gap-2 bg-[#FFF8EC] p-2.5", cls)}>{children}</div>;
  switch (id) {
    case "menu": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("menu")} />
              {body(
                <>
                  <Dish name="Brochettes de bœuf" price="2 000 F" />
                  <Btn on>{L("addDish")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 50, y: 52 },
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("newDish")} />
              {body(
                <>
                  <Field label={L("name")} value="Riz gras" focus />
                  <Field label={L("price")} value="2 500 F" />
                  <Btn tone="gold">✨ {L("suggest")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 30, y: 72 },
        };
      if (step === 2)
        return {
          screen: (
            <>
              <Bar title={L("newDish")} />
              {body(
                <>
                  <div className="demo-fade-in flex h-20 items-center justify-center rounded-xl bg-gradient-to-br from-[#B24A26] to-[#E9B530] text-2xl">📷</div>
                  <span className="text-[10px] text-[#0F6B3E]">✓ {L("photoOk")}</span>
                  <Btn on>{L("save")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 50, y: 82 },
        };
      return {
        screen: (
          <>
            <Bar title={L("menu")} />
            {body(
              <>
                <Dish name="Brochettes de bœuf" price="2 000 F" />
                <Dish name="Riz gras" price="2 500 F" isNew />
              </>,
            )}
          </>
        ),
      };
    }
    case "qr": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("seating")} />
              {body(
                <>
                  <div className="flex flex-wrap gap-1.5">{["1", "2", "3", "4", "5", "6"].map((n) => <Seat key={n} label={n} />)}</div>
                  <Btn on>🖨️ {L("printQr")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 50, y: 70 },
        };
      if (step === 1)
        return {
          screen: (
            <div className="demo-fade-in grid flex-1 grid-cols-2 gap-1.5 bg-white p-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="flex flex-col items-center gap-1 rounded border border-dashed border-neutral-300 p-1">
                  <span className="text-[8px] font-bold">{L("table")} {n}</span>
                  <span className="grid h-10 w-10 grid-cols-3 gap-px bg-white">{Array.from({ length: 9 }, (_, i) => <span key={i} className={(i * 7 + n) % 3 ? "bg-black" : "bg-white"} />)}</span>
                  <span className="text-[7px] font-mono font-bold">RC-K7M3P</span>
                </div>
              ))}
            </div>
          ),
        };
      if (step === 2)
        return {
          screen: (
            <div className="flex flex-1 items-end justify-center bg-gradient-to-b from-[#FFF8EC] to-[#E8DCC7] p-3">
              <div className="relative h-16 w-40 rounded-t-[50%] bg-[#8B5A2B] shadow-lg">
                <span className="demo-pop absolute -top-7 left-1/2 flex h-12 w-10 -translate-x-1/2 flex-col items-center justify-center rounded border border-neutral-300 bg-white text-[7px] font-bold">
                  ▦<span>{L("table")} 4</span>
                </span>
              </div>
            </div>
          ),
        };
      return {
        screen: (
          <>
            <Bar title="Restaurant Démo" />
            {body(
              <>
                <span className="demo-pop self-start rounded-full bg-white px-2 py-1 text-[10px] font-bold">📍 {L("table")} 4</span>
                <Dish name="Poulet bicyclette" price="6 500 F" />
                <Dish name="Jus de bissap" price="500 F" />
              </>,
            )}
          </>
        ),
      };
    }
    case "publish": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("settings")} />
              {body(
                <>
                  <span className="text-[11px] font-bold">{L("publishTitle")}</span>
                  <Btn on>{L("publishBtn")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 50, y: 45 },
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("settings")} />
              {body(<span className="demo-pop rounded-lg bg-emerald-50 p-2 text-[11px] font-bold text-emerald-900">✓ {L("online")}</span>)}
            </>
          ),
        };
      return {
        screen: (
          <>
            <Bar title={L("share")} />
            {body(
              <>
                <span className="rounded-lg bg-white p-2 font-mono text-[10px]">restocool.com/r/restaurant-demo</span>
                <span className="rounded-lg bg-white p-2 font-mono text-[11px] font-bold">RC-K7M3P</span>
                <Btn tone="ghost" on>
                  WhatsApp
                </Btn>
              </>,
            )}
          </>
        ),
        tap: { x: 50, y: 70 },
      };
    }
    case "service":
    case "confirm":
    case "serve": {
      const tablet = (cols: [React.ReactNode, React.ReactNode, React.ReactNode]) => (
        <>
          <Bar title={L("frontDesk")} />
          <div className="flex flex-1 gap-1.5 bg-[#FFF8EC] p-1.5">
            <Col title={L("toConfirm")}>{cols[0]}</Col>
            <Col title={L("inKitchen")}>{cols[1]}</Col>
            <Col title={L("ready")}>{cols[2]}</Col>
          </div>
        </>
      );
      const seq = id === "serve" ? step + 2 : step;
      if (seq === 0)
        return {
          screen: tablet([
            <OrderCard no={L("orderNo")} key="o" seat="4" status={L("sent")} pop>
              <span className="text-[9px] font-bold text-[#B24A26]">🔔 {L("newOrder")}</span>
            </OrderCard>,
            null,
            null,
          ]),
          device: "tablet",
        };
      if (seq === 1)
        return {
          screen: tablet([
            <OrderCard no={L("orderNo")} key="o" seat="4" status={L("sent")}>
              <Btn on>{L("confirm")}</Btn>
            </OrderCard>,
            null,
            null,
          ]),
          tap: { x: 18, y: 72 },
          device: "tablet",
        };
      if (seq === 2) return { screen: tablet([null, <OrderCard no={L("orderNo")} key="o" seat="4" status={L("cooking")} pop />, null]), device: "tablet" };
      if (seq === 3)
        return {
          screen: tablet([
            null,
            null,
            <OrderCard no={L("orderNo")} key="o" seat="4" status={L("ready")} pop>
              <Btn on>{L("served")}</Btn>
            </OrderCard>,
          ]),
          tap: { x: 82, y: 72 },
          device: "tablet",
        };
      return {
        screen: (
          <>
            <Bar title="Restaurant Démo" />
            {body(
              <div className="demo-pop m-auto rounded-2xl bg-white p-3 text-center shadow">
                <span className="text-2xl">🎉</span>
                <p className="text-[11px] font-extrabold">{L("bonAppetit")}</p>
              </div>,
            )}
          </>
        ),
      };
    }
    case "kitchen": {
      const card = (state: "pending" | "cooking" | "ready", btn?: boolean) => (
        <div className="flex flex-col gap-1.5 rounded-xl border-2 border-[#E8DCC7] bg-white p-2">
          <div className="flex items-center justify-between">
            <Seat label="7" />
            <span className="text-[10px] font-bold">{L("orderNo")} · {L("min3")}</span>
          </div>
          <span className={cn("rounded-lg border-2 px-2 py-1 text-[11px] font-bold", state === "ready" ? "border-emerald-600 bg-emerald-50" : state === "cooking" ? "border-orange-500 bg-orange-50" : "border-[#E8DCC7]")}>
            2× Brochettes · {state === "ready" ? L("readyShort") : state === "cooking" ? L("cooking") : L("todo")}
          </span>
          <span className="rounded-lg border-2 border-[#E8DCC7] px-2 py-1 text-[11px] font-bold">1× Alloco</span>
          {btn && <Btn on>✓ {L("allReady")}</Btn>}
        </div>
      );
      const scr = (inner: React.ReactNode) => (
        <>
          <Bar title={L("kitchenScreen")} dark />
          <div className="flex flex-1 flex-col gap-1.5 bg-[#FFF8EC] p-2">
            <div className="flex gap-1">{[L("all"), L("grill"), L("drinks")].map((s, i) => <span key={s} className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold", i === 1 ? "bg-[#0F6B3E] text-white" : "bg-white")}>{s}</span>)}</div>
            {inner}
          </div>
        </>
      );
      if (step === 0) return { screen: scr(<div className="demo-pop">{card("pending")}</div>), device: "tablet" };
      if (step === 1) return { screen: scr(card("cooking")), tap: { x: 45, y: 58 }, device: "tablet" };
      if (step === 2) return { screen: scr(card("ready", true)), tap: { x: 50, y: 88 }, device: "tablet" };
      return { screen: scr(<span className="demo-pop rounded-xl bg-emerald-50 p-2 text-[11px] font-bold text-emerald-950">🔔 {L("floorNotified")}</span>), device: "tablet" };
    }
    case "soldout": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("kitchenScreen")} dark />
              {body(
                <div className="flex justify-end">
                  <Btn tone="red" on>
                    {L("soldOutBtn")}
                  </Btn>
                </div>,
              )}
            </>
          ),
          tap: { x: 82, y: 22 },
          device: "tablet",
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("soldOutTitle")} dark />
              {body(
                <>
                  {["Riz gras", "Poulet bicyclette", "Dégué"].map((d, i) => (
                    <span key={d} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[11px]">
                      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", i === 1 ? "border-red-700 bg-red-700 text-[9px] text-white" : "border-neutral-400")}>{i === 1 ? "✓" : ""}</span>
                      <span className={i === 1 ? "font-bold text-red-700" : ""}>{d}</span>
                    </span>
                  ))}
                </>,
              )}
            </>
          ),
          tap: { x: 12, y: 50 },
          device: "tablet",
        };
      return {
        screen: (
          <>
            <Bar title="Restaurant Démo" />
            {body(
              <>
                <Dish name="Riz gras" price="2 500 F" />
                <div className="demo-pop">
                  <Dish name="Poulet bicyclette" price="6 500 F" out outLabel={L("soldOut")} />
                </div>
              </>,
            )}
          </>
        ),
      };
    }
    case "staff": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("personnel")} />
              {body(
                <>
                  <Field label={L("name")} value="Mariam" focus />
                  <Field label="PIN" value="••••" />
                  <Btn on>{L("add")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 50, y: 78 },
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("personnel")} />
              {body(
                <>
                  {[
                    ["001", L("owner")],
                    ["002", "Awa"],
                    ["003", "Issa"],
                  ].map(([n, name]) => (
                    <span key={n} className="flex gap-3 rounded-lg bg-white px-2 py-1.5 text-[11px]">
                      <b className="font-mono">{n}</b>
                      {name}
                    </span>
                  ))}
                  <span className="demo-pop flex gap-3 rounded-lg bg-[#E9B530]/30 px-2 py-1.5 text-[11px] font-bold">
                    <b className="font-mono">004</b>Mariam
                  </span>
                </>,
              )}
            </>
          ),
        };
      if (step === 2)
        return {
          screen: (
            <>
              <Bar title={L("personnel")} />
              {body(
                <div className="flex items-center gap-2 rounded-xl bg-white p-2">
                  <span className="grid h-12 w-12 grid-cols-3 gap-px">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i % 2 ? "bg-black" : "bg-white"} />)}</span>
                  <span className="text-[10px]">{L("qrPoster")}</span>
                </div>,
              )}
            </>
          ),
        };
      return {
        screen: (
          <>
            <Bar title={L("personnel")} />
            {body(
              <>
                <span className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-[11px]">
                  <span>004 · Mariam</span>
                  <span className="font-bold text-emerald-700">● {L("present")}</span>
                </span>
                <span className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-[11px]">
                  <span>003 · Issa</span>
                  <Btn tone="ghost" on>
                    {L("checkIn")}
                  </Btn>
                </span>
              </>,
            )}
          </>
        ),
        tap: { x: 78, y: 48 },
      };
    }
    case "analytics": {
      const kpis = (
        <div className="grid grid-cols-3 gap-1">
          {[
            [L("orders"), "48"],
            [L("sales"), "186 500 F"],
            [L("serviceTime"), L("min14")],
          ].map(([k, v]) => (
            <span key={k} className="rounded-lg bg-white p-1.5">
              <span className="block text-[8px] text-[#5B6B60]">{k}</span>
              <span className="text-[11px] font-extrabold">{v}</span>
            </span>
          ))}
        </div>
      );
      if (step === 0) return { screen: <><Bar title={L("dashboard")} />{body(<div className="demo-fade-in">{kpis}</div>)}</> };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("dashboard")} />
              {body(
                <>
                  <div className="flex gap-1 self-end rounded-full bg-white p-0.5 text-[9px] font-bold">
                    <span className="px-2 py-0.5">{L("today")}</span>
                    <span className="rounded-full bg-[#0F6B3E] px-2 py-0.5 text-white">{L("days7")}</span>
                  </div>
                  <div className="flex h-14 items-end gap-0.5 rounded-lg bg-white p-1">{[3, 5, 8, 6, 9, 4, 7].map((h, i) => <span key={i} className="demo-pop flex-1 rounded-t bg-[#0F6B3E]" style={{ height: `${h * 10}%`, animationDelay: `${i * 60}ms` }} />)}</div>
                </>,
              )}
            </>
          ),
          tap: { x: 84, y: 22 },
        };
      return {
        screen: (
          <>
            <Bar title={L("dashboard")} />
            {body(
              <div className="rounded-lg bg-white p-1.5 text-[10px]">
                {[
                  ["002", "Awa", 21],
                  ["004", "Mariam", 17],
                ].map(([n, name, c]) => (
                  <span key={String(n)} className="flex justify-between border-b border-[#E8DCC7] py-1 last:border-0">
                    <b className="font-mono">{n}</b>
                    <span>{name}</span>
                    <span>{c} ✓</span>
                  </span>
                ))}
              </div>,
            )}
          </>
        ),
      };
    }
    case "checkin": {
      const kiosk = (inner: React.ReactNode) => (
        <>
          <Bar title={L("checkinTitle")} />
          {body(inner)}
        </>
      );
      if (step === 0)
        return {
          screen: (
            <div className="relative flex flex-1 items-center justify-center bg-[#E8DCC7]">
              <span className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded bg-white text-[8px] font-bold shadow">
                <span className="grid h-12 w-12 grid-cols-3 gap-px">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i % 2 ? "bg-black" : "bg-white"} />)}</span>
                {L("checkinTitle")}
              </span>
              <span className="demo-beam" />
            </div>
          ),
        };
      if (step === 1) return { screen: kiosk(<><Field label={L("staffNo")} value="004" focus /><Field label="PIN" value="" /></>) };
      if (step === 2) return { screen: kiosk(<><Field label={L("staffNo")} value="004" /><Field label="PIN" value="••••" focus /><Btn on>{L("punch")}</Btn></>), tap: { x: 50, y: 74 } };
      return { screen: kiosk(<span className="demo-pop rounded-xl bg-emerald-50 p-2 text-[11px] text-emerald-950"><b className="block">{L("helloMariam")}</b>{L("arrivalAt")}</span>) };
    }
    case "scan": {
      if (step === 0)
        return {
          screen: (
            <div className="flex flex-1 flex-col gap-2 bg-black p-3 text-white">
              <span className="rounded-lg bg-[#E9B530] py-2 text-center text-lg font-extrabold text-black">{L("table")} 4</span>
              <span className="text-[11px]">2 × Riz gras</span>
              <span className="text-[11px]">1 × Jus de bissap</span>
              <span className="mx-auto grid h-14 w-14 grid-cols-3 gap-px bg-white p-1">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i % 3 ? "bg-black" : "bg-white"} />)}</span>
            </div>
          ),
        };
      if (step === 1)
        return {
          screen: (
            <div className="relative flex flex-1 items-center justify-center bg-neutral-800">
              <span className="grid h-20 w-20 grid-cols-3 gap-px bg-white p-1">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i % 3 ? "bg-black" : "bg-white"} />)}</span>
              <span className="demo-beam" />
            </div>
          ),
        };
      return {
        screen: (
          <>
            <Bar title={L("frontDesk")} />
            {body(
              <OrderCard no={L("orderNo")} seat="4" status={L("sent")} pop>
                <Btn on>{L("confirm")}</Btn>
              </OrderCard>,
            )}
          </>
        ),
        tap: { x: 30, y: 62 },
      };
    }
    case "reservations": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("reservations")} />
              {body(
                <>
                  <span className="text-[11px] font-bold text-[#17231C]">⚙️ {L("resvSettings")}</span>
                  <span className="flex items-center gap-2 rounded-lg bg-white p-2 text-[11px] font-bold text-[#17231C] shadow-sm">
                    <span className="demo-pulse flex h-4 w-4 items-center justify-center rounded bg-[#0F6B3E] text-[9px] text-white">✓</span>
                    {L("resvOpen")}
                  </span>
                  <Btn on>{L("save")}</Btn>
                </>,
              )}
            </>
          ),
          tap: { x: 22, y: 30 },
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title="Restaurant Démo" />
              {body(
                <>
                  <Btn tone="ghost" on className="self-start">📅 {L("bookTable")}</Btn>
                  <span className="grid grid-cols-4 gap-1">{["19:00", "19:30", "20:00", "20:30"].map((h, i) => <span key={h} className={cn("rounded-md py-1 text-center text-[10px] font-bold", i === 1 ? "bg-[#0F6B3E] text-white" : "bg-white text-[#17231C]")}>{h}</span>)}</span>
                  <Field label={L("guests")} value="4" />
                  <Field label="Email" value="awa@…" />
                </>,
              )}
            </>
          ),
          tap: { x: 40, y: 22 },
        };
      if (step === 2)
        return {
          screen: (
            <>
              <Bar title={L("reservations")} />
              {body(
                <div className="demo-pop flex flex-col gap-1 rounded-xl border-2 border-[#E9B530] bg-white p-2">
                  <span className="text-[13px] font-extrabold text-[#17231C]">19:30 · 4</span>
                  <span className="text-[11px] font-bold text-[#17231C]">Awa O.</span>
                  <span className="flex gap-1">
                    <Btn on>📞 +226 70…</Btn>
                    <Btn tone="ghost">☎️ {L("called")}</Btn>
                  </span>
                </div>,
              )}
            </>
          ),
          tap: { x: 30, y: 52 },
        };
      return {
        screen: (
          <>
            <Bar title={L("reservations")} />
            {body(
              <>
                <div className="flex flex-col gap-1 rounded-xl bg-white p-2 shadow-sm">
                  <span className="text-[13px] font-extrabold text-[#17231C]">19:30 · 4 · Awa O.</span>
                  <Btn on>✓ {L("confirm")}</Btn>
                </div>
                <span className="demo-pop rounded-xl bg-emerald-50 p-2 text-[10px] font-bold text-emerald-900">✉️ {L("emailQrSent")}</span>
              </>,
            )}
          </>
        ),
        tap: { x: 50, y: 34 },
      };
    }
    case "waitTime": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("reservations")} />
              {body(
                <>
                  <span className="text-[11px] font-bold text-[#17231C]">⏳ {L("waitTitle")}</span>
                  <span className="flex flex-wrap gap-1">{["15", "30", "45", "60"].map((m) => <span key={m} className={cn("rounded-lg border-2 px-2 py-1 text-[10px] font-bold", m === "45" ? "demo-pulse border-[#0F6B3E] bg-[#0F6B3E]/10" : "border-[#E8DCC7] bg-white")}>{m} min</span>)}</span>
                </>,
              )}
            </>
          ),
          tap: { x: 62, y: 30 },
        };
      if (step === 1) return { screen: <><Bar title={L("reservations")} />{body(<><Field label={L("waitNote")} value={L("waitNoteValue")} focus /><Btn on>{L("waitShow")}</Btn></>)}</>, tap: { x: 50, y: 50 } };
      return {
        screen: (
          <>
            <Bar title="Restaurant Démo" />
            {body(
              <>
                <span className="demo-pop self-start rounded-xl bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-950">⏳ {L("waitPublic")}</span>
                <Dish name="Riz gras" price="2 500 F" />
              </>,
            )}
          </>
        ),
      };
    }
    case "resvCheckin": {
      const qr = (
        <span className="grid h-16 w-16 grid-cols-4 gap-px bg-white p-1">{Array.from({ length: 16 }, (_, i) => <span key={i} className={(i * 7) % 3 ? "bg-black" : "bg-white"} />)}</span>
      );
      if (step === 0)
        return {
          screen: (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#FFF8EC] p-3">
              <span className="text-[11px] font-bold text-[#0B3D26]">✉️ {L("emailQr")}</span>
              {qr}
              <span className="text-[10px] text-[#5B6B60]">R-K7M3P · 19:30</span>
            </div>
          ),
        };
      if (step === 1)
        return {
          screen: (
            <div className="relative flex flex-1 items-center justify-center bg-neutral-800">
              {qr}
              <span className="demo-beam" />
            </div>
          ),
        };
      return {
        screen: (
          <>
            <Bar title={L("reservations")} />
            {body(
              <>
                <span className="rounded-xl bg-sky-50 p-2 text-center text-[11px] font-bold text-[#17231C]">🎟️ {L("resvValid")}</span>
                <span className="text-[13px] font-extrabold text-[#17231C]">19:30 · 4 · Awa O.</span>
                <Btn on className="py-2.5">✓ {L("confirmArrival")}</Btn>
                <span className="text-[9px] text-[#5B6B60]">{L("qrOnce")}</span>
              </>,
            )}
          </>
        ),
        tap: { x: 50, y: 62 },
      };
    }
    case "releaseTable": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title={L("frontDesk")} />
              {body(
                <OrderCard no={L("orderNo")} seat="4" status={L("served")}>
                  <Btn on tone="gold">🪑 {L("tableFree")}</Btn>
                </OrderCard>,
              )}
            </>
          ),
          tap: { x: 32, y: 58 },
        };
      if (step === 1) return { screen: <><Bar title={L("frontDesk")} />{body(<div className="demo-pop flex flex-col gap-2 rounded-xl bg-white p-2 shadow"><span className="text-[11px] font-bold text-[#17231C]">{L("tableFreeAsk")}</span><Btn on>{L("yesFree")}</Btn></div>)}</>, tap: { x: 50, y: 40 } };
      return {
        screen: (
          <>
            <Bar title={L("floorLive")} />
            {body(
              <span className="grid grid-cols-3 gap-1.5">
                {["1", "2", "3", "4", "5", "6"].map((n) => (
                  <span key={n} className={cn("flex h-10 flex-col items-center justify-center rounded-lg text-[10px] font-bold", n === "4" ? "demo-pop bg-emerald-100 text-emerald-900" : n === "2" ? "bg-amber-100 text-amber-950" : n === "5" ? "bg-sky-100 text-sky-900" : "bg-white text-[#17231C]")}>
                    {n}
                    <span className="text-[8px] font-normal">{n === "4" ? L("free") : n === "2" ? L("inKitchen") : n === "5" ? L("eating") : L("free")}</span>
                  </span>
                ))}
              </span>,
            )}
          </>
        ),
      };
    }
    case "reviews": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title="Restaurant Démo" />
              {body(
                <>
                  <span className="text-[11px] font-bold text-[#17231C]">{L("rateUs")}</span>
                  <span className="demo-pulse text-xl text-[#E9B530]">★★★★☆</span>
                  <Field label={L("comment")} value={L("commentValue")} />
                </>,
              )}
            </>
          ),
          tap: { x: 55, y: 30 },
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("reviewsTitle")} />
              {body(
                <div className="flex flex-col gap-1 rounded-xl bg-white p-2 shadow-sm">
                  <span className="text-[#E9B530]">★☆☆☆☆</span>
                  <span className="text-[10px] text-[#17231C]">« … »</span>
                  <span className="flex gap-1"><Btn on tone="ghost">{L("hide")}</Btn><Btn tone="red">{L("delete")}</Btn></span>
                </div>,
              )}
            </>
          ),
          tap: { x: 24, y: 48 },
        };
      return { screen: <><Bar title={L("reviewsTitle")} />{body(<span className="flex items-center gap-2 rounded-lg bg-white p-2 text-[11px] font-bold text-[#17231C] shadow-sm"><span className="demo-pulse h-4 w-7 rounded-full bg-[#0F6B3E]" />{L("reviewsOnOff")}</span>)}</>, tap: { x: 18, y: 20 } };
    }
    case "sharedOrder": {
      if (step === 0)
        return {
          screen: (
            <>
              <Bar title="Restaurant Démo" />
              {body(
                <>
                  <span className="rounded-xl bg-[#25D366] p-2 text-center text-[11px] font-bold text-white">💬 {L("shareTable")}</span>
                  <span className="rounded-lg bg-white p-1.5 text-[10px] text-[#17231C]">Moussa · ✓ {L("done")}</span>
                  <span className="rounded-lg bg-white p-1.5 text-[10px] text-[#17231C]">Fati · … </span>
                </>,
              )}
            </>
          ),
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title={L("frontDesk")} />
              {body(
                <div className="demo-pop flex flex-col gap-1 rounded-xl border-2 border-[#E9B530] bg-white p-2">
                  <Seat label="4" />
                  <span className="text-[10px] text-[#17231C]">2 × Riz gras <i className="text-[#5B6B60]">« Awa »</i></span>
                  <span className="text-[10px] text-[#17231C]">1 × Brochettes <i className="text-[#5B6B60]">« Moussa · sans piment »</i></span>
                </div>,
              )}
            </>
          ),
        };
      return { screen: <><Bar title={L("frontDesk")} />{body(<span className="demo-pop rounded-xl bg-emerald-50 p-2 text-[11px] font-bold text-emerald-900">🍛 {L("serveByName")}</span>)}</> };
    }
    case "offline": {
      if (step === 0)
        return { screen: <><span className="bg-red-700 px-2 py-1.5 text-center text-[10px] font-bold text-white">📶 {L("offlineBanner")}</span>{body(<OrderCard no={L("orderNo")} seat="4" status={L("sent")}><Btn on>{L("confirm")}</Btn></OrderCard>)}</>, tap: { x: 30, y: 58 } };
      if (step === 1) return { screen: <><span className="bg-red-700 px-2 py-1.5 text-center text-[10px] font-bold text-white">📶 {L("offlineBanner")}</span>{body(<OrderCard no={L("orderNo")} seat="4" status={L("pendingSync")} pop />)}</> };
      return { screen: <><span className="bg-emerald-700 px-2 py-1.5 text-center text-[10px] font-bold text-white">✓ {L("backOnline")}</span>{body(<OrderCard no={L("orderNo")} seat="4" status={L("inKitchen")} />)}</> };
    }
    case "rc": {
      if (step === 0)
        return {
          screen: (
            <div className="flex flex-1 items-center justify-center bg-[#E8DCC7]">
              <span className="flex flex-col items-center gap-1 rounded bg-white p-2 text-[8px] shadow">
                <span className="grid h-10 w-10 grid-cols-3 gap-px">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i % 2 ? "bg-black" : "bg-white"} />)}</span>
                <span className="demo-pulse rounded bg-[#E9B530]/40 px-1 font-mono text-[11px] font-bold">RC-K7M3P</span>
              </span>
            </div>
          ),
        };
      if (step === 1)
        return {
          screen: (
            <>
              <Bar title="restocool.com/c" />
              {body(<><Field label={L("rcNumber")} value="RC-K7M3P" focus /><Btn on>{L("openMenu")}</Btn></>)}
            </>
          ),
          tap: { x: 50, y: 62 },
        };
      return {
        screen: (
          <>
            <Bar title="Restaurant Démo" />
            {body(
              <>
                <span className="demo-pop self-start rounded-full bg-white px-2 py-1 text-[10px] font-bold">📍 {L("table")} 4</span>
                <Dish name="Riz gras" price="2 500 F" />
              </>,
            )}
          </>
        ),
      };
    }
  }
}

/** Phone or tablet frame around a scene, with the tapping finger. */
export function SceneFrame({ scene, stepKey }: { scene: Scene; stepKey: string }) {
  const tablet = scene.device === "tablet";
  return (
    <div className={cn("relative mx-auto overflow-hidden border-[6px] border-[#17231C] bg-[#17231C] shadow-xl", tablet ? "aspect-[4/3] w-full max-w-sm rounded-2xl" : "aspect-[9/16] w-48 rounded-[1.75rem]")} aria-hidden>
      <div key={stepKey} className="demo-fade-in flex h-full flex-col overflow-hidden rounded-[inherit] bg-[#FFF8EC]">
        {scene.screen}
      </div>
      {scene.tap && (
        <span key={`${stepKey}-tap`} className="pointer-events-none absolute" style={{ left: `${scene.tap.x}%`, top: `${scene.tap.y}%` }}>
          <span className="demo-tap" style={{ animationDelay: "0.7s", animationIterationCount: 2 }} />
          <span className="guide-finger absolute text-2xl">👆</span>
        </span>
      )}
    </div>
  );
}

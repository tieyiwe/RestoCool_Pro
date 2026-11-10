import { formatFCFA } from "@/lib/format";

type Strings = { newOrder: string; table: string; items: string; served: string; open: string };

/** Static phone mock-up of a RestoCool menu, with floating "live" cards. Pure CSS, no client JS. */
export function PhoneMock({ s }: { s: Strings }) {
  const dishes = [
    { code: "10", name: "Poulet bicyclette", sub: "走地鸡 · Free-range chicken", price: `${formatFCFA(3500)} / ${formatFCFA(6500)}`, color: "#B24A26" },
    { code: "20", name: "Riz gras", sub: "油焖饭 · Jollof-style rice", price: formatFCFA(2500)!, color: "#0F6B3E" },
    { code: "40", name: "Jus de bissap", sub: "洛神花汁 · Hibiscus juice", price: formatFCFA(500)!, color: "#7a1f3d" },
    { code: "41", name: "Jus de gingembre", sub: "姜汁 · Ginger juice", price: formatFCFA(500)!, color: "#a16207" },
  ];
  return (
    <div className="relative mx-auto w-[280px] sm:w-[300px]" aria-hidden>
      {/* glow */}
      <div className="absolute -inset-10 rounded-full bg-or/25 blur-3xl" />
      <div className="relative rounded-[2.8rem] border-[10px] border-encre bg-encre shadow-2xl">
        <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="overflow-hidden rounded-[2.1rem] bg-creme text-encre">
          <div className="bg-vert px-4 pt-9 pb-4 text-creme">
            <p className="font-display text-lg font-extrabold">Restaurant Démo</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] opacity-90">
              Ouagadougou <span className="rounded-full bg-emerald-200 px-2 font-bold text-emerald-900">{s.open}</span>
            </p>
          </div>
          <div className="flex gap-1.5 px-3 py-2">
            {["Grillades", "Plats", "Boissons"].map((c, i) => (
              <span key={c} className={i === 0 ? "rounded-full bg-encre px-3 py-1 text-[10px] font-bold text-creme" : "rounded-full bg-sable px-3 py-1 text-[10px] font-bold"}>
                {c}
              </span>
            ))}
          </div>
          <ul className="flex flex-col gap-2 px-3 pb-20">
            {dishes.map((d) => (
              <li key={d.code} className="flex items-center gap-2.5 rounded-xl bg-white p-2 shadow-sm">
                <span className="font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${d.color}, #17231C)` }}>
                  {d.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold">{d.name}</span>
                  <span className="block truncate text-[10px] text-encre-2">{d.sub}</span>
                  <span className="block text-[11px] font-bold tabular-nums">{d.price}</span>
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-vert text-sm font-bold text-creme">+</span>
              </li>
            ))}
          </ul>
          <div className="absolute inset-x-5 bottom-6 flex items-center justify-between rounded-2xl bg-encre px-4 py-3 text-[12px] font-bold text-creme shadow-lg">
            <span>
              Ma sélection <span className="ml-1 rounded-full bg-or px-1.5 text-encre">3</span>
            </span>
            <span className="tabular-nums">{formatFCFA(7500)}</span>
          </div>
        </div>
      </div>

      {/* floating live cards */}
      <div className="landing-float absolute top-44 -left-16 hidden w-44 rounded-2xl bg-white p-3 text-encre shadow-xl sm:block">
        <p className="text-[11px] font-bold text-vert">● {s.newOrder}</p>
        <p className="font-display mt-1 text-lg leading-none font-extrabold">{s.table}</p>
        <p className="text-[11px] text-encre-2">
          {s.items} · {formatFCFA(7500)}
        </p>
      </div>
      <div className="landing-float-late absolute -right-10 bottom-28 hidden rounded-2xl bg-or px-4 py-3 text-encre shadow-xl sm:block">
        <p className="font-display text-base font-extrabold">🍽️ {s.served}</p>
      </div>
    </div>
  );
}

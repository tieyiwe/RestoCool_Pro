import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { getDb } from "@/db";
import { ensureSeatCodes, formatRc } from "@/lib/access-codes";
import { requireMemberPage } from "@/lib/auth/page";
import { brandedQrSvg } from "@/lib/qr-branded";
import { busSeats } from "@/lib/transport/buses";
import { busUrl, codeEntryHost, publicBaseUrl, seatUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

/**
 * Print kit of one bus: a card for each seat back (seat number, « Scannez-moi », its QR and numéro
 * RC), plus the bus's own QR (for the boarding door or the ticket). French + English only.
 */
export default async function BusPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMemberPage("seats.write");
  const { id } = await params;
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const bus = await db.query.buses.findFirst({ where: (b, { and, eq }) => and(eq(b.id, id), eq(b.restaurantId, rid)) });
  if (!bus) notFound();
  const t = await getTranslations("transport.print");
  const tc = await getTranslations("seating.card");
  const r = (await ctx.repo.restaurant.get())!;
  const base = await publicBaseUrl();
  const seats = await busSeats(db, rid, bus.id);
  const codes = await ensureSeatCodes(db, rid, seats.map((s) => s.id));
  const site = codeEntryHost(base);
  const cards = seats.map((s) => ({ key: s.id, title: t("seat", { n: s.label }), svg: brandedQrSvg(seatUrl(base, r.slug, s.qrToken)), code: codes.get(s.id) ?? "" }));

  return (
    <div className="print-kit">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print { html, body { background: #fff !important; } .sheet { break-after: page; box-shadow: none !important; margin: 0 !important; } }
      `}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/app/buses" className="min-h-11 rounded-lg border border-border px-4 py-2.5 font-semibold">
          ← {t("back")}
        </Link>
        <PrintButton label={t("print")} />
        <span className="text-sm text-muted-foreground">{t("hint", { bus: bus.name, n: seats.length })}</span>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        {/* The bus's own QR: shows the whole seat map (door, ticket office). */}
        <section className="sheet mx-auto mb-6 flex w-[194mm] flex-col items-center gap-[4mm] bg-white p-[10mm] text-center text-black shadow-lg" data-testid="bus-qr-card">
          <p className="font-display text-[8mm] font-extrabold" style={{ color: r.accentColor }}>
            {r.name}
          </p>
          <p className="text-[6mm] font-extrabold">🚌 {bus.name}</p>
          <p className="rounded-full bg-black px-[4mm] py-[1mm] text-[5mm] font-extrabold text-white">
            📷 {tc("scanMe")} <span className="text-[3.6mm] opacity-80">· {tc("scanMeEn")}</span>
          </p>
          <div className="w-[70mm]" dangerouslySetInnerHTML={{ __html: brandedQrSvg(busUrl(base, r.slug, bus.qrToken)) }} />
          <p className="text-[4mm]">{t("busCard")}</p>
        </section>
        {chunk(cards, 12).map((page, i) => (
          <section key={i} className="sheet mx-auto mb-6 grid h-[281mm] w-[194mm] grid-cols-3 grid-rows-4 bg-white text-black shadow-lg">
            {page.map((c) => (
              <div key={c.key} className="flex flex-col items-center justify-center gap-[1mm] border border-dashed border-neutral-300 p-[3mm] text-center" data-testid="seat-card">
                <p className="text-[3mm] font-bold leading-tight" style={{ color: r.accentColor }}>
                  {r.name} · {bus.name}
                </p>
                <p className="font-display text-[7mm] leading-none font-extrabold">{c.title}</p>
                <p className="rounded-full bg-black px-[2mm] py-[0.5mm] text-[3mm] font-extrabold text-white">
                  📷 {tc("scanMe")} · {tc("scanMeEn")}
                </p>
                <div className="w-[30mm]" dangerouslySetInnerHTML={{ __html: c.svg }} />
                <p className="flex items-baseline gap-[1mm] leading-none">
                  <span className="text-[2.2mm] font-bold uppercase text-neutral-600">{tc("rcLabel")}</span>
                  <b className="font-mono text-[3.8mm] tracking-[0.4mm]">{formatRc(c.code)}</b>
                </p>
                <p className="text-[2.2mm] leading-tight text-neutral-600">{tc("noScan", { site })}</p>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

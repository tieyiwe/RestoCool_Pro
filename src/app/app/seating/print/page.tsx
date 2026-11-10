import QRCode from "qrcode";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { requireMemberPage } from "@/lib/auth/page";
import { hasFeature } from "@/lib/plan";
import { getDb } from "@/db";
import { ensureMainCode, ensureSeatCodes, formatRc } from "@/lib/access-codes";
import { codeEntryHost, menuUrl, publicBaseUrl, seatUrl } from "@/lib/urls";

type Card = { key: string; title: string; svg: string; code: string };

/**
 * Printable QR kit: A4 pages, printed or saved as PDF from the browser (FR/EN/ZH text and the
 * restaurant logo render exactly as on screen). Tent = one folding table tent per page.
 */
export default async function PrintCardsPage({ searchParams }: { searchParams: Promise<{ layout?: string; qr?: string }> }) {
  const ctx = await requireMemberPage("seats.write");
  const t = await getTranslations("seating");
  const sp = await searchParams;
  const layout = sp.layout === "grid" ? "grid" : "tent";
  // ?qr=main: the restaurant's main QR (menu link), whatever the QR strategy.
  const mainOnly = sp.qr === "main";
  const [r, seatRows] = await Promise.all([ctx.repo.restaurant.get(), ctx.repo.seating.seats()]);
  if (!r) return null;
  const base = await publicBaseUrl();
  const perSeat = !mainOnly && (r.settings.qrStrategy ?? "per_seat") === "per_seat" && hasFeature(r, "qrPerSeat");
  const svg = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#17231C", light: "#FFFFFF" } });

  let cards: Card[];
  if (perSeat) {
    const printable = seatRows.filter((s) => s.active && (s.type === "table" || s.type === "room" || s.type === "area"));
    const codes = await ensureSeatCodes(getDb(), r.id, printable.map((s) => s.id));
    cards = await Promise.all(
      printable.map(async (s) => ({ key: s.id, title: `${t(`typeOne.${s.type}`)} ${s.label}`, svg: await svg(seatUrl(base, r.slug, s.qrToken)), code: codes.get(s.id)! })),
    );
  } else {
    const [generic, code] = await Promise.all([svg(menuUrl(base, r.slug)), ensureMainCode(getDb(), r.id)]);
    cards = Array.from({ length: layout === "grid" ? 6 : 1 }, (_, i) => ({ key: `g${i}`, title: "", svg: generic, code }));
  }
  const site = codeEntryHost(base);

  const face = (c: Card) => (
    <div className="flex h-full flex-col items-center justify-between gap-2 p-[6mm] text-center" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="flex flex-col items-center gap-1">
        {r.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- printed logo
          <img src={r.logoUrl} alt="" className="h-[14mm] w-auto object-contain" />
        ) : null}
        <p className="font-display text-[6mm] leading-tight font-extrabold" style={{ color: r.accentColor }}>
          {r.name}
        </p>
      </div>
      {c.title && <p className="font-display text-[9mm] leading-none font-extrabold">{c.title}</p>}
      <p className="text-[4mm] font-bold leading-none">{t("card.scan")}</p>
      <div className={layout === "grid" ? "w-[34mm]" : "w-[46mm]"} dangerouslySetInnerHTML={{ __html: c.svg }} />
      {/* Two steps for customers who have never scanned a QR code. */}
      <ol className="flex w-full flex-col gap-[1mm] text-left text-[3.1mm] leading-tight" data-testid="scan-steps">
        <li className="flex items-start gap-[1.5mm]">
          <span className="flex h-[4.5mm] w-[4.5mm] shrink-0 items-center justify-center rounded-full bg-black text-[2.8mm] font-bold text-white">1</span>
          <span>
            <b>{t("card.step1")}</b> <span className="text-neutral-600">· {t("card.step1En")} · <span lang="zh-Hans">{t("card.step1Zh")}</span></span>
          </span>
        </li>
        <li className="flex items-start gap-[1.5mm]">
          <span className="flex h-[4.5mm] w-[4.5mm] shrink-0 items-center justify-center rounded-full bg-black text-[2.8mm] font-bold text-white">2</span>
          <span>
            <b>{t("card.step2")}</b> <span className="text-neutral-600">· {t("card.step2En")} · <span lang="zh-Hans">{t("card.step2Zh")}</span></span>
          </span>
        </li>
      </ol>
      {/* No scan? Type the code on the website: opens the same page as the QR. */}
      <p className="w-full rounded-[1.5mm] border border-neutral-300 px-[2mm] py-[1mm] text-[2.8mm] leading-tight" data-testid="card-code">
        {t("card.noScan", { site })} <b className="font-mono text-[4.4mm] tracking-[0.6mm] text-black">{formatRc(c.code)}</b>
      </p>
      {r.poweredBadge && (
        <p className="flex items-center gap-1 text-[2.6mm] text-neutral-500">
          {/* eslint-disable-next-line @next/next/no-img-element -- small brand icon */}
          <img src="/brand/png/app-icon-192.png" alt="" className="h-[4mm] w-[4mm] rounded-[22%]" />
          {t("card.poweredBy")}
        </p>
      )}
    </div>
  );

  return (
    <div className="print-kit">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; }
          .print-kit .sheet { break-after: page; box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={mainOnly ? "/app" : "/app/seating"} className="min-h-11 rounded-lg border border-border px-4 py-2.5 font-semibold">
          ← {t("title")}
        </Link>
        <PrintButton label={t("print")} />
        <span className="text-sm text-muted-foreground">{layout === "tent" ? t("printTent") : t("printGrid")}</span>
        {mainOnly && <p className="w-full text-sm">{t("mainPrintHint")}</p>}
      </div>
      {layout === "tent"
        ? cards.map((c) => (
            <section key={c.key} className="sheet mx-auto mb-6 flex h-[281mm] w-[194mm] flex-col bg-white text-black shadow-lg" data-testid="print-card">
              {/* Top half is upside down so both faces read correctly once folded. */}
              <div className="h-1/2 rotate-180">{face(c)}</div>
              <div className="relative h-0 border-t border-dashed border-neutral-400">
                <span className="absolute -top-2.5 left-2 bg-white px-1 text-[2.6mm] text-neutral-400">{t("card.fold")}</span>
              </div>
              <div className="h-1/2">{face(c)}</div>
            </section>
          ))
        : chunk(cards, 6).map((page, i) => (
            <section key={i} className="sheet mx-auto mb-6 grid h-[281mm] w-[194mm] grid-cols-2 grid-rows-3 bg-white text-black shadow-lg">
              {page.map((c) => (
                <div key={c.key} className="border border-dashed border-neutral-300" data-testid="print-card">
                  {face(c)}
                </div>
              ))}
            </section>
          ))}
    </div>
  );
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

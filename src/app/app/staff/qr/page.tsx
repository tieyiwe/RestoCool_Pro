import { brandedQrSvg } from "@/lib/qr-branded";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { getDb } from "@/db";
import { ensureMainCode, formatRc } from "@/lib/access-codes";
import { requireMemberPage } from "@/lib/auth/page";
import { attendanceEnabled, ensureAttendanceToken } from "@/lib/personnel/attendance";
import { codeEntryHost, publicBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

/** A4 poster with the check-in QR, for the staff entrance. */
export default async function AttendanceQrPage() {
  const ctx = await requireMemberPage("staff.write");
  const r = (await ctx.repo.restaurant.get())!;
  if (!attendanceEnabled(r)) notFound();
  const t = await getTranslations("pointage");
  const ta = await getTranslations("attendance");
  const db = getDb();
  const base = await publicBaseUrl();
  const [token, code] = await Promise.all([ensureAttendanceToken(db, r), ensureMainCode(db, r.id)]);
  const svg = brandedQrSvg(`${base}/pointage/${token}`);
  return (
    <div>
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/app/staff" className="min-h-11 rounded-lg border border-border px-4 py-2.5 font-semibold">
          ← {ta("title")}
        </Link>
        <PrintButton label={ta("print")} />
      </div>
      {/* A4 preview: on a phone it scrolls inside its frame, not the whole page. */}
      <div className="overflow-x-auto print:overflow-visible">
      <section className="mx-auto flex h-[270mm] w-[186mm] flex-col items-center justify-center gap-6 bg-white p-[12mm] text-center text-black shadow-lg print:shadow-none" data-testid="attendance-poster">
        <p className="text-[6mm] font-bold">{r.name}</p>
        <h1 className="font-display text-[12mm] leading-tight font-extrabold">{t("title")}</h1>
        <div className="w-[110mm]" dangerouslySetInnerHTML={{ __html: svg }} />
        <ol className="flex flex-col gap-[3mm] text-left text-[5mm]">
          <li>1. {t("poster1")}</li>
          <li>2. {t("poster2")}</li>
          <li>3. {t("poster3")}</li>
        </ol>
        <p className="text-[4mm] text-neutral-600">{t("posterRc", { site: `${codeEntryHost(base).replace(/\/c$/, "")}/pointage`, rc: formatRc(code) })}</p>
      </section>
      </div>
    </div>
  );
}

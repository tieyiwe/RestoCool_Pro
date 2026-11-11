import { brandedQrSvg } from "@/lib/qr-branded";
import { StickerDownload } from "./sticker-download";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { ensureMainCode, formatRc } from "@/lib/access-codes";
import { codeEntryHost, menuUrl, publicBaseUrl } from "@/lib/urls";

/**
 * The restaurant's main QR code: it points to /r/{slug}, so it exists as soon as the restaurant
 * does (every plan, including Gratuit). Shown at the end of setup and on the dashboard.
 */
export async function MainQrCard({ restaurantId, slug, published }: { restaurantId: string; slug: string; published: boolean }) {
  const t = await getTranslations("mainQr");
  const base = await publicBaseUrl();
  const url = menuUrl(base, slug);
  const code = await ensureMainCode(getDb(), restaurantId);
  const svg = brandedQrSvg(url);
  const tc = await getTranslations("seating.card");
  const r = await getDb().query.restaurants.findFirst({ where: (x, { eq }) => eq(x.id, restaurantId), columns: { name: true } });
  const sticker = {
    scanMe: tc("scanMe"),
    scanMeAlt: `${tc("scanMeEn")} · ${tc("scanMeZh")}`,
    rcLabel: tc("rcLabel"),
    noScan: tc("noScan", { site: codeEntryHost(base) }),
    powered: tc("poweredBy"),
  };
  return (
    <Card className="flex flex-col gap-4 text-left sm:flex-row sm:items-start" data-testid="main-qr">
      {/* As printed: « Scannez-moi » above, the numéro RC right below. */}
      <div className="mx-auto flex w-44 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-white p-2 text-[#17231c] sm:mx-0" data-testid="main-qr-sticker">
        <span className="rounded-full bg-[#17231c] px-3 py-0.5 text-sm font-extrabold text-white">📷 {sticker.scanMe}</span>
        <div className="w-full" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="font-mono text-base font-extrabold tracking-widest">{formatRc(code)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <p className="text-sm">{t("ready")}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>{t("howPrint")}</li>
          <li>{t("howPlace")}</li>
          <li>{t("howScan")}</li>
        </ol>
        {/* The restaurant's « Numéro RC »: its unique identifier on RestoCool (also printed on stickers). */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/50 p-3" data-testid="rc-block">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("rcTitle")}</p>
            <p className="font-mono text-2xl font-extrabold tracking-widest" data-testid="main-qr-code">
              {formatRc(code)}
            </p>
          </div>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t("codeLabel", { site: codeEntryHost(base) })}</p>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground" data-testid="main-qr-url">
          {url}
        </p>
        {!published && <p className="rounded-md bg-or/15 px-3 py-2 text-sm">{t("notPublished")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/seating/print?qr=main&layout=grid">🖨️ {t("print")}</Link>
          </Button>
          <StickerDownload
            qrSrc="/api/app/qr?seat=generic"
            rc={formatRc(code)}
            name={r?.name ?? ""}
            filename={`${slug}-qr-rc`}
            text={sticker}
            label={`⬇️ ${t("download")}`}
            className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted"
          />
        </div>
      </div>
    </Card>
  );
}

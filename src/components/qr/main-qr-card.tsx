import QRCode from "qrcode";
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
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#17231C", light: "#FFFFFF" } });
  return (
    <Card className="flex flex-col gap-4 text-left sm:flex-row sm:items-start" data-testid="main-qr">
      <div className="mx-auto w-40 shrink-0 rounded-lg border border-border bg-white p-2 sm:mx-0" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <p className="text-sm">{t("ready")}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>{t("howPrint")}</li>
          <li>{t("howPlace")}</li>
          <li>{t("howScan")}</li>
        </ol>
        <p className="text-sm">
          {t("codeLabel", { site: codeEntryHost(base) })}{" "}
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-lg font-bold tracking-widest" data-testid="main-qr-code">
            {formatRc(code)}
          </span>
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground" data-testid="main-qr-url">
          {url}
        </p>
        {!published && <p className="rounded-md bg-or/15 px-3 py-2 text-sm">{t("notPublished")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/seating/print?qr=main&layout=grid">🖨️ {t("print")}</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/app/qr?seat=generic">{t("download")}</a>
          </Button>
        </div>
      </div>
    </Card>
  );
}

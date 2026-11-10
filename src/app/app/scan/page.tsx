import { getTranslations } from "next-intl/server";
import { Scanner } from "@/components/scan/scanner";
import { requireMemberPage } from "@/lib/auth/page";

export const dynamic = "force-dynamic";

/** « Scanner »: the customer's order QR, the check-in QR, or a table / menu QR. */
export default async function ScanPage() {
  await requireMemberPage("restaurant.read");
  const t = await getTranslations("scan");
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <Scanner />
    </div>
  );
}

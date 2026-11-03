import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";

/** Built in a later milestone (seating: M3, staff: M5). */
export default async function Page() {
  const t = await getTranslations("app");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-extrabold">{t("seating")}</h1>
      <Card className="text-muted-foreground">{t("comingSoon")}</Card>
    </div>
  );
}

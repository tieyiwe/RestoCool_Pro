import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";

/** Shown instead of the live screens on the Gratuit plan (menu only). */
export async function ServicePlanGate() {
  const t = await getTranslations("service");
  return (
    <Card className="mx-auto max-w-lg text-center" data-testid="service-plan-gate">
      <p className="text-4xl" aria-hidden>
        🔒
      </p>
      <h1 className="mt-2 text-xl font-extrabold">{t("planRequiredTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("planRequired")}</p>
      <Link href="/#pricing" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
        {t("seePlans")}
      </Link>
    </Card>
  );
}

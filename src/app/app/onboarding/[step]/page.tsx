import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppearanceSection, ContactsSection, HoursSection, ProfileSection, ServiceSection } from "@/components/settings/sections";
import { requireMemberPage } from "@/lib/auth/page";
import { FinishOnboarding } from "./finish";

const STEPS = ["profile", "contacts", "hours", "service", "appearance"] as const;

/** Setup wizard shown after creating a restaurant: the same forms as Settings, one per step. */
export default async function OnboardingStep({ params }: { params: Promise<{ step: string }> }) {
  const ctx = await requireMemberPage("settings.write");
  const n = Number((await params).step);
  if (!Number.isInteger(n) || n < 1 || n > STEPS.length + 1) notFound();
  const t = await getTranslations("settings");
  const [r, hours] = await Promise.all([ctx.repo.restaurant.get(), ctx.repo.restaurant.openingHours()]);
  if (!r) redirect("/app");

  if (n === STEPS.length + 1) {
    return (
      <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
        <p className="text-5xl" aria-hidden>
          🎉
        </p>
        <h1 className="text-2xl font-extrabold">{t("wizard.done")}</h1>
        <FinishOnboarding label={t("wizard.goMenu")} />
      </Card>
    );
  }

  const step = STEPS[n - 1]!;
  const next = `/app/onboarding/${n + 1}`;
  const props = { r, next, submitLabel: t("next") };
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">{t("wizard.step", { n, total: STEPS.length })}</p>
        <h1 className="text-2xl font-extrabold">{t(`${step}.title`)}</h1>
        <div className="mt-2 h-2 rounded-full bg-muted" aria-hidden>
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(n / STEPS.length) * 100}%` }} />
        </div>
      </div>
      <Card>
        {step === "profile" && <ProfileSection {...props} />}
        {step === "contacts" && <ContactsSection {...props} />}
        {step === "hours" && <HoursSection hours={hours} next={next} submitLabel={t("next")} />}
        {step === "service" && <ServiceSection {...props} />}
        {step === "appearance" && <AppearanceSection {...props} />}
      </Card>
      <div className="flex flex-wrap justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href={next}>{t("skip")}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/app">{t("wizard.finishLater")}</Link>
        </Button>
      </div>
    </div>
  );
}

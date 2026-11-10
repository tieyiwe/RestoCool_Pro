import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MainQrCard } from "@/components/qr/main-qr-card";
import { AppearanceSection, ContactsSection, HoursSection, ProfileSection, ServiceSection } from "@/components/settings/sections";
import { SetupShell } from "@/components/setup/setup-shell";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { markOnboarded } from "@/lib/restaurants/settings";

const STEPS = ["profile", "contacts", "hours", "service", "appearance"] as const;

/** Setup wizard after creating a restaurant: the same forms as Settings, one per step. */
export default async function OnboardingStep({ params }: { params: Promise<{ step: string }> }) {
  const ctx = await requireMemberPage("settings.write", { duringSetup: true });
  const n = Number((await params).step);
  if (!Number.isInteger(n) || n < 1 || n > STEPS.length + 1) notFound();
  const t = await getTranslations("settings");
  const ts = await getTranslations("setup");
  const [r, hours, seatRows] = await Promise.all([ctx.repo.restaurant.get(), ctx.repo.restaurant.openingHours(), ctx.repo.seating.seats()]);
  if (!r) redirect("/app");

  if (n === STEPS.length + 1) {
    // Reaching the end unlocks the app (menu, tables, service, personnel, analytics).
    if (!r.settings.onboardedAt) await markOnboarded({ db: getDb(), actor: ctx.actor, repo: ctx.repo });
    const next = [
      { href: "/app/menu", icon: "🍽️", key: "dishes", primary: true },
      { href: "/app/seating/print?qr=main&layout=grid", icon: "🖨️", key: "print", primary: false },
      { href: `/r/${r.slug}`, icon: "👀", key: "preview", primary: false },
    ] as const;
    return (
      <SetupShell current="done">
        <div className="flex flex-col gap-5">
          <div className="relative overflow-hidden rounded-3xl bg-[var(--rc-nuit)] p-6 text-[var(--rc-creme)] sm:p-8" data-testid="setup-done">
            <div className="rc-weave pointer-events-none absolute inset-0 opacity-10" aria-hidden />
            <p className="relative text-4xl" aria-hidden>
              🎉
            </p>
            <h1 className="font-display relative mt-2 text-3xl font-extrabold">{t("wizard.done")}</h1>
            <p className="relative mt-2 max-w-xl text-[var(--rc-creme)]/85">{ts("doneText", { name: r.name })}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {next.map((x) => (
              <Link
                key={x.key}
                href={x.href}
                className={
                  x.primary
                    ? "flex min-h-24 flex-col justify-between rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm hover:opacity-95"
                    : "flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-surface p-4 hover:bg-muted"
                }
                data-testid={`done-${x.key}`}
              >
                <span className="text-2xl" aria-hidden>
                  {x.icon}
                </span>
                <span className="font-bold">{ts(`next.${x.key}`)} →</span>
              </Link>
            ))}
          </div>
          <MainQrCard restaurantId={r.id} slug={r.slug} published={r.published} />
        </div>
      </SetupShell>
    );
  }

  const step = STEPS[n - 1]!;
  const next = `/app/onboarding/${n + 1}`;
  const props = { r, next, submitLabel: n === STEPS.length ? t("wizard.finish") : t("next") };
  return (
    <SetupShell current={step}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">{t("wizard.step", { n: n + 1, total: STEPS.length + 1 })}</p>
          <h1 className="font-display text-3xl font-extrabold">{t(`${step}.title`)}</h1>
          <p className="mt-1 text-muted-foreground">{ts(`steps.${step}.hint`)}</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
          {step === "profile" && <ProfileSection {...props} />}
          {step === "contacts" && <ContactsSection {...props} />}
          {step === "hours" && <HoursSection hours={hours} next={next} submitLabel={props.submitLabel} />}
          {step === "service" && <ServiceSection {...props} askTableCount={!seatRows.some((x) => x.type === "table")} />}
          {step === "appearance" && <AppearanceSection {...props} />}
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {n > 1 ? (
            <Link href={`/app/onboarding/${n - 1}`} className="flex min-h-11 items-center rounded-lg px-3 font-semibold hover:bg-muted">
              ← {t("wizard.back")}
            </Link>
          ) : (
            <span />
          )}
          <Link href={next} className="flex min-h-11 items-center rounded-lg px-3 font-semibold text-muted-foreground hover:bg-muted">
            {t("skip")}
          </Link>
        </div>
      </div>
    </SetupShell>
  );
}

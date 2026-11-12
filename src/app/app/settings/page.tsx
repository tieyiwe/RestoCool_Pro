import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { AppearanceSection, ContactsSection, FeaturesSection, HoursSection, LocationSection, ProfileSection, PublishSection, ServiceSection } from "@/components/settings/sections";
import { requireMemberPage } from "@/lib/auth/page";
import { DangerLink } from "@/components/settings/danger-link";

export default async function SettingsPage() {
  const ctx = await requireMemberPage("settings.write");
  const t = await getTranslations("settings");
  const td = await getTranslations("danger");
  const [r, hours] = await Promise.all([ctx.repo.restaurant.get(), ctx.repo.restaurant.openingHours()]);
  if (!r) return null;
  const sections: Array<[string, string, React.ReactNode]> = [
    ["publish", t("publish.title"), <PublishSection key="p" r={r} />],
    [
      "profile",
      t("profile.title"),
      <div key="pr" className="flex flex-col gap-6">
        <ProfileSection r={r} />
        <LocationSection r={r} />
      </div>,
    ],
    ["contacts", t("contacts.title"), <ContactsSection key="c" r={r} />],
    ["hours", t("hours.title"), <HoursSection key="h" hours={hours} />],
    ["service", t("service.title"), <ServiceSection key="s" r={r} />],
    ["appearance", t("appearance.title"), <AppearanceSection key="a" r={r} />],
    ["features", t("features.title"), <FeaturesSection key="f" r={r} />],
  ];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
        <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("title")}>
          {sections.map(([id, title]) => (
            <a key={id} href={`#${id}`} className="flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold">
              {title}
            </a>
          ))}
        </nav>
      </div>
      {sections.map(([id, title, node]) => (
        <Card key={id} id={id} className="scroll-mt-20">
          <h2 className="mb-4 text-lg font-bold">{title}</h2>
          {node}
        </Card>
      ))}
      {ctx.actor.role === "owner" && ctx.actor.via !== "pin" && (
        <Card id="danger" className="scroll-mt-20 border-red-300">
          <h2 className="mb-1 text-lg font-bold text-red-800 dark:text-red-200">{td("title")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{td("settingsHint")}</p>
          <DangerLink label={td("open")} confirm={td("openConfirm")} />
        </Card>
      )}
    </div>
  );
}

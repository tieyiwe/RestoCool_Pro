import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuideCenter } from "@/components/guide/guide-player";
import { GuideTabs } from "@/components/guide/guide-tabs";
import type { GuideId, Profile } from "@/components/guide/guide-scenes";
import { requireMemberPage } from "@/lib/auth/page";
import { guideProfiles } from "@/lib/guide-profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("guide"))("title") };
}

/**
 * In-app guide, by profile. The owner has every tutorial (« Propriétaire ») and each team
 * profile as a tab, to train someone or show them their screen; others see their own profiles.
 */
export default async function AppGuidePage({ searchParams }: { searchParams: Promise<{ for?: string; g?: string }> }) {
  const ctx = await requireMemberPage("restaurant.read");
  const t = await getTranslations("guide");
  const sp = await searchParams;
  const profiles = guideProfiles(ctx.actor, ctx.repo.restaurantId);
  const profile: Profile = profiles.includes(sp.for as Profile) ? (sp.for as Profile) : profiles[0]!;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5" data-testid="guide-page" data-profile={profile}>
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <GuideTabs base="/app/guide" profile={profile} profiles={profiles} />
      <p className="text-sm text-muted-foreground" data-testid="guide-profile-hint">
        {t(`profileHint.${profile}`)}
        {profiles.length > 1 && profile !== profiles[0] ? ` ${t("trainHint")}` : ""}
      </p>
      <GuideCenter key={profile} audience={profile} initial={(sp.g as GuideId) ?? null} inApp />
    </div>
  );
}

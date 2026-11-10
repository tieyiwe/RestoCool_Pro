import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuideCenter } from "@/components/guide/guide-player";
import { GuideTabs } from "@/components/guide/guide-tabs";
import type { Audience, GuideId } from "@/components/guide/guide-scenes";
import { requireMemberPage } from "@/lib/auth/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("guide"))("title") };
}

/** In-app guide. Owners/managers start on their tutorials, personnel on theirs. */
export default async function AppGuidePage({ searchParams }: { searchParams: Promise<{ for?: string; g?: string }> }) {
  const ctx = await requireMemberPage("restaurant.read");
  const t = await getTranslations("guide");
  const sp = await searchParams;
  const isManager = ctx.actor.role === "owner" || ctx.actor.role === "manager";
  const audience: Audience = sp.for === "staff" || sp.for === "manager" ? sp.for : isManager ? "manager" : "staff";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <GuideTabs base="/app/guide" audience={audience} />
      <GuideCenter key={audience} audience={audience} initial={(sp.g as GuideId) ?? null} inApp />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { GuideCenter } from "@/components/guide/guide-player";
import { GuideTabs } from "@/components/guide/guide-tabs";
import type { Audience, GuideId } from "@/components/guide/guide-scenes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide");
  return { title: t("title"), description: t("introPublic"), alternates: { canonical: "/guide" } };
}

/** Public guide (restocool.com/guide): personnel without an account can learn too. */
export default async function PublicGuidePage({ searchParams }: { searchParams: Promise<{ for?: string; g?: string }> }) {
  const t = await getTranslations("guide");
  const sp = await searchParams;
  const audience: Audience = sp.for === "manager" ? "manager" : "staff";
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="RestoCool">
            <Logo />
          </Link>
          <Link href="/pointage" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-muted">
            {t("checkinLink")}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("introPublic")}</p>
        </div>
        <GuideTabs base="/guide" audience={audience} />
        <GuideCenter key={audience} audience={audience} initial={(sp.g as GuideId) ?? null} inApp={false} />
      </main>
    </div>
  );
}

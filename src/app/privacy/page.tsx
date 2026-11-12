import type { Metadata } from "next";
import { LegalPage, legalLang } from "@/components/legal/legal-page";
import { PrivacyEn, PrivacyFr } from "@/components/legal/privacy-content";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  // French is the reference text at /privacy; the English version has its own URL (?lang=en).
  const en = (await searchParams).lang === "en";
  return {
    title: "Politique de confidentialité / Privacy policy",
    description: "Comment RestoCool traite les données personnelles. How RestoCool processes personal data.",
    alternates: { canonical: en ? "/privacy?lang=en" : "/privacy", languages: { fr: "/privacy", en: "/privacy?lang=en", "x-default": "/privacy" } },
  };
}

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang, zh } = await legalLang(searchParams);
  return (
    <LegalPage kind="privacy" lang={lang} zh={zh}>
      {lang === "fr" ? <PrivacyFr /> : <PrivacyEn />}
    </LegalPage>
  );
}

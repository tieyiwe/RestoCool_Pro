import type { Metadata } from "next";
import { LegalPage, legalLang } from "@/components/legal/legal-page";
import { PrivacyEn, PrivacyFr } from "@/components/legal/privacy-content";

export const metadata: Metadata = {
  title: "Politique de confidentialité / Privacy policy",
  description: "Comment RestoCool traite les données personnelles. How RestoCool processes personal data.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang, zh } = await legalLang(searchParams);
  return (
    <LegalPage kind="privacy" lang={lang} zh={zh}>
      {lang === "fr" ? <PrivacyFr /> : <PrivacyEn />}
    </LegalPage>
  );
}

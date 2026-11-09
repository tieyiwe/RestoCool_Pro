import type { Metadata } from "next";
import { LegalPage, legalLang } from "@/components/legal/legal-page";
import { TermsEn, TermsFr } from "@/components/legal/terms-content";

export const metadata: Metadata = {
  title: "Conditions générales d’utilisation / Terms and conditions",
  description: "Conditions d’utilisation de RestoCool. RestoCool terms and conditions.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang, zh } = await legalLang(searchParams);
  return (
    <LegalPage kind="terms" lang={lang} zh={zh}>
      {lang === "fr" ? <TermsFr /> : <TermsEn />}
    </LegalPage>
  );
}

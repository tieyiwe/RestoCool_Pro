import type { Metadata } from "next";
import { LegalPage, legalLang } from "@/components/legal/legal-page";
import { TermsEn, TermsFr } from "@/components/legal/terms-content";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  // French is the reference text at /terms; the English version has its own URL (?lang=en).
  const en = (await searchParams).lang === "en";
  return {
    title: "Conditions générales d’utilisation / Terms and conditions",
    description: "Conditions d’utilisation de RestoCool. RestoCool terms and conditions.",
    alternates: { canonical: en ? "/terms?lang=en" : "/terms", languages: { fr: "/terms", en: "/terms?lang=en", "x-default": "/terms" } },
  };
}

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang, zh } = await legalLang(searchParams);
  return (
    <LegalPage kind="terms" lang={lang} zh={zh}>
      {lang === "fr" ? <TermsFr /> : <TermsEn />}
    </LegalPage>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { Logo } from "@/components/brand/logo";
import { LEGAL } from "@/config/legal";

export type LegalLang = "fr" | "en";

/** French is the reference version. English for convenience; Chinese readers get the English text. */
export async function legalLang(searchParams: Promise<{ lang?: string }>): Promise<{ lang: LegalLang; zh: boolean }> {
  const q = (await searchParams).lang;
  if (q === "fr" || q === "en") return { lang: q, zh: false };
  const cookie = (await cookies()).get("NEXT_LOCALE")?.value;
  if (cookie === "en") return { lang: "en", zh: false };
  if (cookie === "zh") return { lang: "en", zh: true };
  return { lang: "fr", zh: false };
}

const LABELS = {
  fr: { privacy: "Politique de confidentialité", terms: "Conditions générales d’utilisation", updated: "En vigueur le", home: "Accueil", reference: "" },
  en: {
    privacy: "Privacy policy",
    terms: "Terms and conditions",
    updated: "Effective",
    home: "Home",
    reference: "This English version is provided for convenience. In case of difference, the French version prevails.",
  },
};

function formatDate(iso: string, lang: LegalLang) {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

export function LegalPage({ kind, lang, zh, children }: { kind: "privacy" | "terms"; lang: LegalLang; zh: boolean; children: React.ReactNode }) {
  const l = LABELS[lang];
  const path = kind === "privacy" ? "/privacy" : "/terms";
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link href="/" aria-label={l.home}>
          <Logo />
        </Link>
        <nav className="flex gap-1 text-sm font-bold" aria-label="Langue / Language">
          <Link href={`${path}?lang=fr`} aria-current={lang === "fr" ? "page" : undefined} className="flex min-h-11 items-center rounded-lg px-3 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">
            FR
          </Link>
          <Link href={`${path}?lang=en`} aria-current={lang === "en" ? "page" : undefined} className="flex min-h-11 items-center rounded-lg px-3 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">
            EN
          </Link>
        </nav>
      </header>
      <main className="legal mx-auto max-w-3xl px-4 py-8" lang={lang}>
        {zh && (
          <p className="mb-4 rounded-lg bg-muted p-3 text-sm" lang="zh-Hans">
            本页面提供法语（具有法律效力）和英语版本。
          </p>
        )}
        <h1 className="text-3xl font-extrabold">{kind === "privacy" ? l.privacy : l.terms}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {l.updated} {formatDate(LEGAL.effectiveDate, lang)} · {LEGAL.product} · {LEGAL.publisher}
        </p>
        {l.reference && <p className="mt-2 text-sm text-muted-foreground italic">{l.reference}</p>}
        <div className="mt-6 flex flex-col gap-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left">
          {children}
        </div>
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
        <Link href={`/privacy?lang=${lang}`} className="underline">
          {l.privacy}
        </Link>{" "}
        ·{" "}
        <Link href={`/terms?lang=${lang}`} className="underline">
          {l.terms}
        </Link>
      </footer>
    </div>
  );
}

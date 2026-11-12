import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CodeForm } from "@/components/code-entry/code-form";
import { Logo } from "@/components/brand/logo";
import { lookupCode } from "@/lib/access-code-redirect";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("codeEntry");
  return { title: t("pageTitle"), description: t("intro"), robots: { index: true, follow: true }, alternates: { canonical: "/c" } };
}

/** restocool.com/c: type the code printed under a QR to open the same menu as scanning it. */
export default async function CodePage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const t = await getTranslations("codeEntry");
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.slice(0, 20) : "";
  let error: string | null = null;
  if (code) {
    const res = await lookupCode(code);
    if (res.ok) redirect(res.path);
    error = res.error;
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <Link href="/" aria-label="RestoCool" className="self-start">
        <Logo />
      </Link>
      <div>
        <h1 className="font-display text-2xl font-extrabold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <CodeForm error={error} defaultValue={code} />
      </div>
      <p className="text-sm text-muted-foreground">{t("orScan")}</p>
    </main>
  );
}

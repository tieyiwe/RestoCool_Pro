import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { KioskForm } from "./kiosk-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pointage"))("title"), robots: NOINDEX };
}

/** restocool.com/pointage: check in or out with the restaurant's numéro RC, matricule and PIN. */
export default async function PointagePage() {
  const t = await getTranslations("pointage");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <Link href="/" aria-label="RestoCool" className="self-start">
        <Logo />
      </Link>
      <div>
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("introRc")}</p>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <KioskForm askRc />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { DemoShowcase } from "@/components/demo/demo-showcase";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("demo");
  return { title: t("title"), description: t("subtitle"), alternates: { canonical: "/demo" } };
}

export default async function DemoPage() {
  const t = await getTranslations("landing");
  return (
    <main className="rc-weave min-h-dvh">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/" aria-label="RestoCool">
          <Logo />
        </Link>
      </header>
      <DemoShowcase headingLevel={1} />
      <div className="flex flex-col items-center gap-3 px-4 pb-16">
        <Button asChild size="lg">
          <Link href="/r/restaurant-demo">{t("seeDemo")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/sign-up">{t("cta")}</Link>
        </Button>
      </div>
    </main>
  );
}

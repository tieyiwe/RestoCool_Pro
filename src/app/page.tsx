import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { DemoShowcase } from "@/components/demo/demo-showcase";
import { Button } from "@/components/ui/button";

/**
 * Temporary home page. The full "100 % local" landing page is built in M7,
 * after the founder confirms which local claims are true (honesty rule).
 */
export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="rc-weave min-h-dvh">
      <section className="flex flex-col items-center gap-8 px-4 pt-16 pb-6 text-center">
        <Logo className="scale-150" />
        <p className="max-w-md text-lg text-muted-foreground">{t("brand.tagline")}</p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">{t("landing.cta")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/r/restaurant-demo">{t("landing.seeDemo")}</Link>
          </Button>
          <a href="#demo-title" className="min-h-11 py-2 text-sm font-semibold text-vert underline-offset-2 hover:underline">
            {t("landing.howItWorks")} ↓
          </a>
        </div>
      </section>
      <DemoShowcase />
      <p className="pb-10 text-center text-sm text-muted-foreground">{t("landing.comingSoon")}</p>
    </main>
  );
}

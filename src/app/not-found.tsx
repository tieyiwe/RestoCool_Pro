import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p className="max-w-sm text-muted-foreground">{t("menu.notFound")}</p>
      <Link href="/" className="font-semibold text-primary underline">
        {t("common.back")}
      </Link>
    </main>
  );
}

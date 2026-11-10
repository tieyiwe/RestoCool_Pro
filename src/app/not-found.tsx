import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Link href="/" aria-label="RestoCool">
        <Logo />
      </Link>
      <h1 className="font-display text-2xl font-extrabold">{t("notFoundTitle")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("notFoundText")}</p>
      <Link href="/" className="flex min-h-11 items-center font-semibold text-primary underline">
        {t("backHome")}
      </Link>
    </main>
  );
}

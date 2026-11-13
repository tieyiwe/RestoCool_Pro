import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { Profile } from "./guide-scenes";

/** One tab per profile (plain links: works without JavaScript). */
export async function GuideTabs({ base, profile, profiles }: { base: string; profile: Profile; profiles: readonly Profile[] }) {
  const t = await getTranslations("guide");
  if (profiles.length < 2) return null;
  return (
    <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1" aria-label={t("audience")}>
      {profiles.map((a) => (
        <Link
          key={a}
          href={`${base}?for=${a}`}
          aria-current={profile === a ? "page" : undefined}
          className={cn("flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap", profile === a ? "bg-surface shadow-sm" : "text-muted-foreground")}
          data-testid={`guide-tab-${a}`}
        >
          {t(`for.${a}`)}
        </Link>
      ))}
    </nav>
  );
}

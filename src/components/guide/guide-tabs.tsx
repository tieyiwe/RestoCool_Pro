import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { Audience } from "./guide-scenes";

/** « Gérants » / « Personnel » switch (plain links: works without JavaScript). */
export async function GuideTabs({ base, audience }: { base: string; audience: Audience }) {
  const t = await getTranslations("guide");
  return (
    <nav className="flex w-fit gap-1 rounded-full bg-muted p-1" aria-label={t("audience")}>
      {(["manager", "staff"] as const).map((a) => (
        <Link
          key={a}
          href={`${base}?for=${a}`}
          aria-current={audience === a ? "page" : undefined}
          className={cn("flex min-h-11 items-center rounded-full px-4 text-sm font-semibold", audience === a ? "bg-surface shadow-sm" : "text-muted-foreground")}
          data-testid={`guide-tab-${a}`}
        >
          {t(`for.${a}`)}
        </Link>
      ))}
    </nav>
  );
}

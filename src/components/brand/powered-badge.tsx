import { getTranslations } from "next-intl/server";

const link = "font-semibold underline-offset-2 hover:underline";

/**
 * Footer badge on every public menu (brand kit: favicon at 24–28px + text).
 * Links to the sign-up page (free advertising). Hideable on the Business plan.
 */
export async function PoweredBadge() {
  const t = await getTranslations("menu");
  return (
    <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- 24px static brand asset */}
      <img src="/brand/png/app-icon-192.png" alt="" width={24} height={24} className="h-6 w-6 rounded-[22%]" loading="lazy" />
      <span>
        {t.rich("poweredBy", {
          resto: (chunks) => (
            <a href="https://restocool.com" className={link}>
              {chunks}
            </a>
          ),
          tib: (chunks) => (
            <a href="https://tiblogics.com" className={link}>
              {chunks}
            </a>
          ),
        })}
      </span>
    </p>
  );
}

import { getTranslations } from "next-intl/server";

const link = "font-semibold underline-offset-2 hover:underline";

/** Footer badge on every public menu; links to the sign-up page (free advertising). */
export async function PoweredBadge() {
  const t = await getTranslations("menu");
  return (
    <p className="text-center text-xs text-muted-foreground">
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
    </p>
  );
}

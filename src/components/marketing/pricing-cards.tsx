import { Check } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PLANS } from "@/config/plans";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The three plan cards (home page summary and /tarifs). Prices come from src/config/plans.ts. */
export async function PricingCards() {
  const t = await getTranslations("landing");
  const plans = [
    { id: "gratuit", price: PLANS.gratuit.priceMonthly, popular: false, cta: t("pricing.ctaFree") },
    { id: "pro", price: PLANS.pro.priceMonthly, popular: true, cta: t("pricing.cta") },
    { id: "business", price: PLANS.business.priceMonthly, popular: false, cta: t("pricing.cta") },
  ] as const;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {plans.map((p) => (
        <article
          key={p.id}
          className={cn("relative flex flex-col rounded-3xl p-7", p.popular ? "bg-nuit text-creme shadow-2xl ring-2 ring-or lg:-translate-y-3" : "border border-ligne bg-white shadow-sm")}
          data-testid={`plan-${p.id}`}
        >
          {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-or px-3 py-1 text-xs font-bold text-encre">{t("pricing.popular")}</span>}
          <h3 className="font-display text-2xl font-extrabold">{t(`pricing.${p.id}.name`)}</h3>
          <p className={cn("mt-1 text-sm", p.popular ? "text-creme/80" : "text-encre-2")}>{t(`pricing.${p.id}.desc`)}</p>
          <p className="mt-5 flex items-baseline gap-1">
            <span className="font-display text-4xl font-extrabold tabular-nums">{formatFCFA(p.price)}</span>
            {p.price > 0 && <span className={p.popular ? "text-creme/70" : "text-encre-2"}>{t("pricing.month")}</span>}
          </p>
          <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
            {(["f1", "f2", "f3", "f4", "f5"] as const).map((f) => (
              <li key={f} className="flex gap-2">
                <Check className={cn("mt-0.5 h-4 w-4 shrink-0", p.popular ? "text-or" : "text-vert")} aria-hidden />
                {t(`pricing.${p.id}.${f}`)}
              </li>
            ))}
          </ul>
          <Link href="/sign-up" className={cn("mt-7 inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-bold", p.popular ? "bg-or text-encre" : "bg-vert text-creme")}>
            {p.cta}
          </Link>
        </article>
      ))}
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { SetupShell } from "@/components/setup/setup-shell";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getMemberContext, getVerifiedEmail } from "@/lib/auth/context";
import { claimBusinessesByEmail } from "@/lib/restaurants/claim";
import { CreateRestaurantForm } from "./create-restaurant-form";

/** Step 1 of getting started: create the business. Everything else unlocks after the setup. */
export default async function NewRestaurantPage() {
  const t = await getTranslations("app.newRestaurant");
  // A business prepared for this person (same verified email): hand it over, open it.
  const me = await getVerifiedEmail();
  if (me && (await claimBusinessesByEmail(getDb(), { clerkUserId: me.userId, verifiedEmail: me.email, name: me.name })).length) redirect("/app");
  const existing = await getMemberContext();
  return (
    <SetupShell current="create">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm font-bold tracking-wide text-primary uppercase">{existing ? t("eyebrowAnother") : t("eyebrow")}</p>
          <h1 className="font-display mt-1 text-3xl leading-tight font-extrabold sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 max-w-xl text-lg text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
            <CreateRestaurantForm />
          </div>
          <ul className="flex flex-col gap-3 text-sm" aria-label={t("benefitsTitle")}>
            {(["menu", "qr", "orders", "records"] as const).map((k) => (
              <li key={k} className="flex gap-3 rounded-2xl bg-muted/60 p-3">
                <span className="text-2xl" aria-hidden>
                  {{ menu: "📱", qr: "🔳", orders: "🛎️", records: "📊" }[k]}
                </span>
                <span>
                  <span className="block font-bold">{t(`benefits.${k}.title`)}</span>
                  <span className="text-muted-foreground">{t(`benefits.${k}.text`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SetupShell>
  );
}

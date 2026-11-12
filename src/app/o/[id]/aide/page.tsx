import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/db";
import { orders, restaurants } from "@/db/schema";
import { BusinessHeader } from "@/app/rejoindre/business-header";
import { NOINDEX } from "@/lib/seo/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: NOINDEX };

const STATES = ["signin", "notmember", "unknown"] as const;

/**
 * Someone scanned a customer's « Montrer au serveur » QR with their phone camera and is not (yet)
 * signed in as part of this restaurant's team: say how to sign in and come back to the order, or
 * how to join the team. Never shows the order itself.
 */
export default async function OrderLinkHelp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> }) {
  const t = await getTranslations("orderLink");
  const { id } = await params;
  const raw = (await searchParams).state;
  const valid = z.uuid().safeParse(id).success;
  const [row] = valid
    ? await getDb()
        .select({ name: restaurants.name, logoUrl: restaurants.logoUrl, accent: restaurants.accentColor })
        .from(orders)
        .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
        .where(eq(orders.id, id))
        .limit(1)
    : [];
  const state = !row ? "unknown" : STATES.includes(raw as (typeof STATES)[number]) ? raw : "signin";
  const back = `/o/${id}`;
  const btn = "flex min-h-12 items-center justify-center rounded-xl px-4 text-center font-bold";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-background px-4 py-8" data-testid="order-link-help" data-state={state}>
      {row && <BusinessHeader name={row.name} logoUrl={row.logoUrl} accent={row.accent} subtitle={t("subtitle")} />}
      {state === "unknown" ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h1 className="font-display text-2xl font-extrabold">{t("unknownTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("unknownText")}</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border-2 border-primary bg-primary/5 p-5">
            <h1 className="font-display text-2xl font-extrabold">{state === "notmember" ? t("notMemberTitle", { name: row!.name }) : t("signInTitle", { name: row!.name })}</h1>
            <p className="mt-2">{state === "notmember" ? t("notMemberText") : t("signInText")}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/sign-in?redirect_url=${encodeURIComponent(back)}`} className={`${btn} bg-primary text-primary-foreground`} data-testid="order-link-signin">
                🔑 {state === "notmember" ? t("otherAccount") : t("signIn")}
              </Link>
              <Link href="/poste" className={`${btn} border border-border bg-surface`} data-testid="order-link-poste">
                📱 {t("tablet")}
              </Link>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-surface p-5" data-testid="order-link-join">
            <h2 className="text-lg font-bold">🙋 {t("joinTitle")}</h2>
            <p className="mt-2">{t("joinText")}</p>
            <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm">
              <li>{t("join1")}</li>
              <li>{t("join2")}</li>
              <li>{t("join3")}</li>
            </ol>
          </section>
        </>
      )}
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">🧾 {t("customer")}</p>
    </main>
  );
}

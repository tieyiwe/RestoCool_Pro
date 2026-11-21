import { and, eq, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BusinessHeader } from "@/app/rejoindre/business-header";
import { getDb } from "@/db";
import { accessCodes, members, menuItems } from "@/db/schema";
import { getIdentity, getVerifiedEmail } from "@/lib/auth/context";
import { findOwnerInvite, maskEmail } from "@/lib/restaurants/owner-invite";
import { NOINDEX } from "@/lib/seo/site";
import { SwitchAccount } from "./switch-account";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: NOINDEX };

/**
 * The owner invitation of a business prepared by RestoCool (`/r/<slug>/proprietaire/<token>`):
 * shows the business, then « Créer mon compte » / « J'ai déjà un compte » with this email. Once
 * signed in with the invited email (verified), it goes straight to the hand-over (…/accepter).
 */
export default async function OwnerInvitePage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ lang?: string; e?: string }> }) {
  const { slug, token } = await params;
  const db = getDb();
  const found = await findOwnerInvite(db, slug, token);
  const sp = await searchParams;
  const invLang = found.state !== "invalid" ? found.restaurant.settings.ownerInvite?.lang : undefined;
  const locale = sp.lang === "en" || sp.lang === "fr" ? sp.lang : (invLang ?? "fr");
  const t = await getTranslations({ locale, namespace: "ownerInvite" });
  const here = `/r/${slug}/proprietaire/${token}`;
  const btn = "flex min-h-12 items-center justify-center rounded-xl px-4 text-center font-bold";
  const date = (d: Date) => new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Africa/Ouagadougou" }).format(d);

  const shell = (body: React.ReactNode) => (
    <main lang={locale} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-background px-4 py-8" data-testid="owner-invite" data-state={found.state}>
      <div className="flex justify-end gap-1 text-sm">
        {(["fr", "en"] as const).map((l) => (
          <Link key={l} href={`${here}?lang=${l}`} aria-current={l === locale ? "true" : undefined} className="min-h-9 rounded-full px-3 py-1.5 font-semibold aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground">
            {l.toUpperCase()}
          </Link>
        ))}
      </div>
      {found.state !== "invalid" && <BusinessHeader name={found.restaurant.name} logoUrl={found.restaurant.logoUrl} accent={found.restaurant.accentColor} subtitle={t("subtitle")} />}
      {body}
      <p className="text-center text-sm">
        <Link href="/aide" className="font-semibold text-primary underline underline-offset-2">
          🛟 {t("help")}
        </Link>
      </p>
    </main>
  );
  const card = (title: string, text: string, extra?: React.ReactNode) => (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h1 className="font-display text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{text}</p>
      {extra && <div className="mt-4 flex flex-col gap-2">{extra}</div>}
    </section>
  );

  if (found.state === "invalid") return shell(card(t("invalidTitle"), t("invalidText")));
  if (found.state === "expired") return shell(card(t("expiredTitle"), t("expiredText")));
  const r = found.restaurant;
  const who = await getIdentity();

  if (found.state === "owned") {
    const mine = who ? await db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, r.id), eq(members.clerkUserId, who.userId))).limit(1) : [];
    return shell(
      card(t("ownedTitle", { name: r.name }), t("ownedText"), mine.length ? <Link href="/app" className={`${btn} bg-primary text-primary-foreground`}>{t("openApp")}</Link> : undefined),
    );
  }

  if (found.state !== "open") return null;

  // Signed in with the invited email (verified): hand the business over right away.
  const me = who ? await getVerifiedEmail() : null;
  if (me && me.email.trim().toLowerCase() === found.email) {
    if (sp.e === "1") return shell(card(t("failedTitle"), t("failedText")));
    redirect(`${here}/accepter`);
  }
  if (who && !me) return shell(card(t("unverifiedTitle"), t("unverifiedText"), <SwitchAccount label={t("switch")} back={here} />));
  if (who && me) {
    return shell(card(t("wrongTitle"), t("wrongText", { email: me.email, invited: maskEmail(found.email) }), <SwitchAccount label={t("switch")} back={here} />));
  }

  const [[count], [rc]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(menuItems).where(eq(menuItems.restaurantId, r.id)),
    db.select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, r.id), isNull(accessCodes.seatId))).limit(1),
  ]);
  const items = count?.n ?? 0;
  const back = encodeURIComponent(here);
  return shell(
    <>
      <section className="rounded-2xl border-2 border-primary bg-primary/5 p-5">
        <h1 className="font-display text-2xl font-extrabold">{t("heading", { name: r.name })}</h1>
        <p className="mt-2">{items > 0 ? t("intro", { name: r.name, items }) : t("introNoItems", { name: r.name })}</p>
        <p className="mt-3 rounded-xl bg-surface p-3 font-semibold" data-testid="owner-invite-email">
          ✉️ {t("forEmail", { email: maskEmail(found.email) })}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link href={`/sign-up?redirect_url=${back}`} className={`${btn} bg-primary text-primary-foreground`} data-testid="owner-invite-signup">
            {t("signUp")}
          </Link>
          <Link href={`/sign-in?redirect_url=${back}`} className={`${btn} border border-border bg-surface`} data-testid="owner-invite-signin">
            {t("signIn")}
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("google")}</p>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-bold">{t("steps")}</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">{t("expires", { date: date(found.expiresAt) })}</p>
      </section>
      <p className="text-center text-sm">
        <Link href={`/r/${r.slug}`} className="font-semibold text-primary underline underline-offset-2">
          {t("seePage", { name: r.name })}
        </Link>
        {rc && <span className="block font-mono text-xs text-muted-foreground">RC-{rc.code}</span>}
      </p>
    </>,
  );
}

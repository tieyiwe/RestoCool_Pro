import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { restaurantByJoinToken } from "@/lib/personnel/join";
import { BusinessHeader } from "../business-header";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("join"))("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Opened by scanning the team QR the owner shows: « Rejoindre l'équipe ». */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("join");
  const r = await restaurantByJoinToken(getDb(), token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10" data-testid="join-page">
      {r ? (
        <>
          <BusinessHeader name={r.name} logoUrl={r.logoUrl} accent={r.accentColor} subtitle={t("title")} />
          <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
            <p className="mb-4 text-muted-foreground">{t("intro", { name: r.name })}</p>
            <JoinForm token={token} />
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("privacy")}</p>
        </>
      ) : (
        <div className="rounded-3xl bg-muted p-6 text-center" data-testid="join-invalid">
          <p className="text-lg font-bold">{t("invalidTitle")}</p>
          <p className="mt-2 text-muted-foreground">{t("invalidText")}</p>
        </div>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { BusinessHeader } from "@/app/rejoindre/business-header";
import { getDb } from "@/db";
import { DEVICE_COOKIE, deviceFromToken, deviceTeam } from "@/lib/devices";
import { formatStaffNo } from "@/lib/personnel";
import { PinPad } from "./pin-pad";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("poste"))("title"), robots: { index: false, follow: false } };
}

/**
 * The shared tablet's home: tap your name, type your PIN. Only on a device the owner or a
 * manager authorised (« Autoriser cet appareil »); anywhere else it explains how to set it up.
 */
export default async function PostePage({ searchParams }: { searchParams: Promise<{ locked?: string; who?: string }> }) {
  const t = await getTranslations("poste");
  const tr = await getTranslations("roles");
  const tl = await getTranslations("app.role");
  const db = getDb();
  const dev = await deviceFromToken(db, (await cookies()).get(DEVICE_COOKIE)?.value);
  const sp = await searchParams;
  if (!dev) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10 text-center" data-testid="poste-unauthorized">
        <p className="text-5xl" aria-hidden>
          📟
        </p>
        <h1 className="font-display text-2xl font-extrabold">{t("notAuthorizedTitle")}</h1>
        <p className="text-muted-foreground">{t("notAuthorizedText")}</p>
        <Link href="/app/staff/devices" className="mx-auto flex min-h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">
          {t("ownerSignIn")}
        </Link>
      </main>
    );
  }
  const team = await deviceTeam(db, dev.restaurant.id);
  const now = Date.now();
  const people = team.map((p) => ({
    id: p.id,
    name: p.name ?? "—",
    staffNo: formatStaffNo(p.staffNo),
    role: p.jobRoleKey ? tr(`names.${p.jobRoleKey}` as "names.server") : (p.jobRoleName ?? tl(p.role as "server")),
    locked: Boolean(p.lockedUntil && p.lockedUntil.getTime() > now),
  }));
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6" data-testid="poste">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BusinessHeader name={dev.restaurant.name} logoUrl={dev.restaurant.logoUrl} accent={dev.restaurant.accentColor} subtitle={`📟 ${dev.device.name}`} />
      </div>
      {sp.locked && (
        <p role="status" className="rounded-xl bg-muted p-3 text-sm" data-testid="poste-locked">
          🔒 {t(sp.locked === "idle" ? "lockedIdle" : "locked")}
        </p>
      )}
      {people.length === 0 ? (
        <p className="rounded-2xl bg-muted p-5 text-center">{t("noTeam")}</p>
      ) : (
        <PinPad people={people} selected={sp.who ?? null} />
      )}
      <p className="text-center text-xs text-muted-foreground">{t("footer")}</p>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { attendanceEnabled, kioskRestaurant } from "@/lib/personnel/attendance";
import { KioskForm } from "../kiosk-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pointage"))("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Opened by scanning the check-in QR the owner placed at the entrance. */
export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await kioskRestaurant(getDb(), { token });
  if (!r) notFound();
  const t = await getTranslations("pointage");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10" data-testid="kiosk">
      <div className="flex items-center gap-3">
        {r.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- restaurant logo
          <img src={r.logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white" style={{ background: r.accentColor }} aria-hidden>
            {r.name.charAt(0)}
          </span>
        )}
        <div>
          <p className="font-display text-xl font-extrabold">{r.name}</p>
          <p className="text-sm text-muted-foreground">{t("title")}</p>
        </div>
      </div>
      {attendanceEnabled(r) ? (
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <p className="mb-4 text-muted-foreground">{t("intro")}</p>
          <KioskForm token={token} />
        </div>
      ) : (
        <p className="rounded-2xl bg-muted p-4">{t("error.disabled")}</p>
      )}
    </main>
  );
}

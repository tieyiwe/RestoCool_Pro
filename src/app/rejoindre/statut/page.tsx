import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { formatStaffNo } from "@/lib/personnel";
import { joinRequestStatus } from "@/lib/personnel/join";
import { JOIN_COOKIE } from "../cookie";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("join"))("title"), robots: { index: false, follow: false } };
}

/** The person's phone after sending: waiting → accepted (matricule) or declined. */
export default async function JoinStatusPage() {
  const t = await getTranslations("join");
  const raw = (await cookies()).get(JOIN_COOKIE)?.value ?? "";
  const [id, secret] = raw.split(".");
  const st = id && secret ? await joinRequestStatus(getDb(), id, secret) : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center" data-testid="join-status" data-status={st?.status ?? "none"}>
      {!st ? (
        <p className="text-muted-foreground">{t("noRequest")}</p>
      ) : st.status === "pending" ? (
        <>
          <AutoRefresh seconds={5} />
          <span className="relative flex size-16 items-center justify-center" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-or/40 motion-reduce:animate-none" />
            <span className="relative text-4xl">⏳</span>
          </span>
          <h1 className="font-display text-2xl font-extrabold">{t("pendingTitle")}</h1>
          <p className="text-muted-foreground">{t("pendingText", { name: st.name, business: st.restaurantName })}</p>
        </>
      ) : st.status === "accepted" ? (
        <>
          <span className="text-5xl" aria-hidden>
            🎉
          </span>
          <h1 className="font-display text-2xl font-extrabold">{t("acceptedTitle", { business: st.restaurantName })}</h1>
          <p className="text-muted-foreground">{t("acceptedText")}</p>
          <div className="rounded-3xl border-2 border-primary bg-white px-8 py-5 text-[#17231c]">
            <p className="text-sm font-bold uppercase tracking-wide">{t("staffNo")}</p>
            <p className="font-mono text-5xl font-extrabold tracking-widest" data-testid="join-staff-no">
              {formatStaffNo(st.staffNo)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{t("acceptedHint")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/pointage" className="flex min-h-12 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground">
              {t("checkIn")}
            </Link>
            <Link href="/guide" className="flex min-h-12 items-center rounded-xl border border-border px-5 font-semibold">
              {t("guide")}
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-extrabold">{t("declinedTitle")}</h1>
          <p className="text-muted-foreground">{t("declinedText", { business: st.restaurantName })}</p>
        </>
      )}
    </main>
  );
}

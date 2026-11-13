import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "RestoCool", robots: NOINDEX };

/** A reservation QR opened by someone who is not on the business's team (often the guest). */
export default async function ReservationQrHelp({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ state?: string }> }) {
  const [{ token }, { state }] = await Promise.all([params, searchParams]);
  const t = await getTranslations("reservation.qrHelp");
  return (
    <div className="min-h-dvh bg-creme px-4 py-10 text-encre" data-testid="rv-help">
      <div className="mx-auto flex max-w-md flex-col gap-4 text-center">
        <Link href="/" aria-label="RestoCool" className="self-center">
          <Logo />
        </Link>
        <p className="text-5xl" aria-hidden>
          🎟️
        </p>
        <h1 className="font-display text-2xl font-extrabold">{t(state === "unknown" ? "unknownTitle" : "title")}</h1>
        <p className="text-encre-2">{t(state === "unknown" ? "unknownText" : "text")}</p>
        {state !== "unknown" && (
          <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/rv/${token}`)}`} className="text-sm font-semibold text-vert underline">
            {t("staff")}
          </Link>
        )}
      </div>
    </div>
  );
}

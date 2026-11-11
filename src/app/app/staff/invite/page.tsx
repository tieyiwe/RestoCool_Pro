import QRCode from "qrcode";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { ensureJoinToken } from "@/lib/personnel/join";
import { publicBaseUrl } from "@/lib/urls";
import { regenerateJoinQrAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * « Inviter mon équipe »: the owner shows this QR on their phone (or prints it). The new person
 * scans it, types their name, phone and a PIN, and the owner accepts them.
 */
export default async function InvitePage() {
  const ctx = await requireMemberPage("staff.write");
  const t = await getTranslations("join.invite");
  const r = (await ctx.repo.restaurant.get())!;
  const url = `${await publicBaseUrl()}/rejoindre/${await ensureJoinToken(getDb(), r)}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#17231C", light: "#FFFFFF" } });
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center" data-testid="invite">
      <div className="print:hidden">
        <Link href="/app/staff" className="text-sm font-semibold text-primary">
          ← {t("back")}
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <p className="hidden text-2xl font-extrabold print:block">{r.name}</p>
      <div className="w-full max-w-xs rounded-3xl border-4 border-primary bg-white p-4" aria-label={t("qrLabel")} role="img" data-testid="invite-qr" data-url={url} dangerouslySetInnerHTML={{ __html: svg }} />
      <ol className="w-full list-decimal space-y-1 pl-6 text-left text-sm">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <form action={regenerateJoinQrAction}>
          <ConfirmButton message={t("regenerateConfirm")} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">
            {t("regenerate")}
          </ConfirmButton>
        </form>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">{t("safety")}</p>
    </div>
  );
}

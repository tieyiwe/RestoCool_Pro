import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { cancelOwnerInviteAction, inviteOwnerAction } from "@/app/admin_pro/actions";
import { whatsappHref } from "@/lib/format";
import { CopyLink } from "./copy-link";

type T = (key: string, values?: Record<string, string | number>) => string;

/**
 * Console: invite the future owner of a business RestoCool prepared (no owner yet). One email,
 * one link that carries the business address; resend renews it; the link can be copied or sent by
 * WhatsApp to the business's number. Hidden once the business has an owner.
 */
export function OwnerInviteCard({
  t,
  id,
  name,
  invite,
  expectedEmail,
  link,
  phone,
  canEdit,
  date,
}: {
  t: T;
  id: string;
  name: string;
  invite: { email: string; lang: "fr" | "en"; sentAt: string; expiresAt: string; count: number; by: string } | null;
  expectedEmail: string | null;
  link: string | null;
  phone: string | null;
  canEdit: boolean;
  date: (d: Date) => string;
}) {
  const expired = invite ? new Date(invite.expiresAt) < new Date() : false;
  const wa = phone && link ? whatsappHref(phone, t("ownerInvite.whatsappText", { name, link })) : null;
  const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
  return (
    <Card className="border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/10" data-testid="owner-invite-card">
      <CardTitle className="mb-1">👤 {t("ownerInvite.title")}</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">{t("ownerInvite.intro")}</p>
      {invite ? (
        <div className="mb-3 flex flex-col gap-2 rounded-xl bg-surface p-3 text-sm" data-testid="owner-invite-status">
          <p>
            <b>{expired ? `⏰ ${t("ownerInvite.expired")}` : `✉️ ${t("ownerInvite.pending")}`}</b> {invite.email}
          </p>
          <p className="text-muted-foreground">
            {t("ownerInvite.sentOn", { date: date(new Date(invite.sentAt)), count: invite.count, by: invite.by })} · {t("ownerInvite.validUntil", { date: date(new Date(invite.expiresAt)) })}
          </p>
          {link && !expired && <CopyLink value={link} label={t("ownerInvite.copy")} done={t("ownerInvite.copied")} testId="owner-invite-link" />}
          <div className="flex flex-wrap gap-2">
            {wa && !expired && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-lg bg-[#25D366] px-4 font-bold text-white" data-testid="owner-invite-whatsapp">
                💬 {t("ownerInvite.whatsapp")}
              </a>
            )}
            {canEdit && (
              <form action={cancelOwnerInviteAction}>
                <input type="hidden" name="id" value={id} />
                <ConfirmButton message={t("ownerInvite.cancelConfirm")} className="min-h-11 rounded-lg border border-red-300 px-4 font-bold text-red-800" data-testid="owner-invite-cancel">
                  {t("ownerInvite.cancel")}
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>
      ) : (
        expectedEmail && <p className="mb-3 rounded-xl bg-surface p-3 text-sm">{t("detail.waitingOwner", { email: expectedEmail })}</p>
      )}
      {canEdit && (
        <form action={inviteOwnerAction} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end" data-testid="owner-invite-form">
          <input type="hidden" name="id" value={id} />
          <label className="text-sm font-semibold">
            {t("ownerInvite.email")}
            <input name="email" type="email" required defaultValue={invite?.email ?? expectedEmail ?? ""} autoComplete="off" className={field} data-testid="owner-invite-email" />
          </label>
          <label className="text-sm font-semibold">
            {t("ownerInvite.lang")}
            <select name="lang" defaultValue={invite?.lang ?? "fr"} className={field}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <button className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground" data-testid="owner-invite-send">
            {invite ? t("ownerInvite.resend") : t("ownerInvite.send")}
          </button>
        </form>
      )}
    </Card>
  );
}

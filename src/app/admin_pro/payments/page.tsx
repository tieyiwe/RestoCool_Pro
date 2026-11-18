import { PaymentsCard } from "@/components/admin/payments-card";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { adminPayments } from "@/lib/admin/payments";
import { requireSuperadminPage } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * Online payments (section 8b) for the whole platform: the encryption key, which provider
 * adapters are written, which businesses connected their own Orange Money / Moov / aggregator
 * account, the last attempts and the provider notifications. Credentials are never shown.
 */
export default async function AdminPaymentsPage() {
  await requireSuperadminPage("billing.read");
  const { t, format } = await adminI18n();
  const p = await adminPayments(getDb());
  const when = (iso: string) => (iso ? format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" }) : "—");
  return (
    <div className="flex flex-col gap-5" data-testid="admin-payments">
      <div>
        <h1 className="text-2xl font-extrabold">🌐 {t("payments.title")}</h1>
        <p className="text-muted-foreground">{t("payments.intro")}</p>
      </div>
      <PaymentsCard p={p} t={t as unknown as (k: string, v?: Record<string, string | number>) => string} when={when} />
    </div>
  );
}

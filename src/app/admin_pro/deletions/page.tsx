import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { requireSuperadminPage } from "@/lib/auth/context";
import { listDeletionRequests } from "@/lib/restaurants/deletion";
import { deletionAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-red-100 text-red-900",
  deleted: "bg-red-700 text-white",
  restored: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-muted",
  refused: "bg-muted",
  purged: "bg-muted text-muted-foreground",
};

/** Owners' requests to delete their business: call them, then confirm or refuse; restore within 10 days. */
export default async function AdminDeletions({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadminPage("businesses.write");
  const [{ t, format }, list, sp] = await Promise.all([adminI18n(), listDeletionRequests(getDb()), searchParams]);
  const dt = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium", timeStyle: "short" }) : "—");
  return (
    <div className="flex flex-col gap-5" data-testid="admin-deletions">
      <div>
        <h1 className="text-2xl font-extrabold">{t("deletions.title")}</h1>
        <p className="text-muted-foreground">{t("deletions.intro")}</p>
      </div>
      {sp.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(`deletions.ok.${sp.ok.replace("deletion_", "")}` as "deletions.ok.confirm")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {t("deletions.error")}
        </p>
      )}
      {list.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">{t("deletions.none")}</p>}
      {list.map((d) => {
        const open = d.status === "pending" || d.status === "confirmed";
        const late = Date.now() >= d.effectiveAt.getTime();
        return (
          <Card key={d.id} id={`d-${d.id}`} className="flex scroll-mt-20 flex-col gap-3" data-testid="deletion-row">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">
                  {d.restaurantId && d.status !== "purged" ? (
                    <Link href={`/admin_pro/businesses/${d.restaurantId}`} className="text-primary">
                      {d.businessName}
                    </Link>
                  ) : (
                    d.businessName
                  )}
                  {d.rcCode && <span className="ml-2 font-mono text-sm text-muted-foreground">RC-{d.rcCode}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {d.ownerName ?? "—"} · {d.ownerEmail ?? t("deletions.noEmail")}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[d.status] ?? "bg-muted"}`} data-testid="deletion-status">
                {t(`deletions.statuses.${d.status}` as "deletions.statuses.pending")}
              </span>
            </div>
            <blockquote className="rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap">{d.reason}</blockquote>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-muted-foreground">{t("deletions.requested")} </dt>
                <dd className="inline">{dt(d.createdAt)}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">{t("deletions.effective")} </dt>
                <dd className="inline font-semibold">{dt(d.effectiveAt)}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">{t("deletions.contacted")} </dt>
                <dd className="inline">{d.contactedAt ? `${dt(d.contactedAt)} · ${d.contactedBy}` : t("deletions.notYet")}</dd>
              </div>
              {d.decidedBy && (
                <div>
                  <dt className="inline text-muted-foreground">{t("deletions.decided")} </dt>
                  <dd className="inline">
                    {dt(d.decidedAt)} · {d.decidedBy}
                  </dd>
                </div>
              )}
              {d.deletedAt && (
                <div>
                  <dt className="inline text-muted-foreground">{t("deletions.deletedAt")} </dt>
                  <dd className="inline">{dt(d.deletedAt)}</dd>
                </div>
              )}
              {d.restoreUntil && d.status === "deleted" && (
                <div>
                  <dt className="inline text-muted-foreground">{t("deletions.restoreUntil")} </dt>
                  <dd className="inline font-semibold">{dt(d.restoreUntil)}</dd>
                </div>
              )}
            </dl>
            {d.adminNote && <p className="text-sm">🗒️ {d.adminNote}</p>}
            {(open || d.status === "deleted") && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                {open && (
                  <form action={deletionAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="what" value="contacted" />
                    <input name="note" maxLength={1000} placeholder={t("deletions.notePlaceholder")} aria-label={t("deletions.notePlaceholder")} className="min-h-11 min-w-64 flex-1 rounded-lg border border-border bg-surface px-3 text-base" />
                    <button className="min-h-11 rounded-lg border border-border bg-surface px-4 font-semibold" data-testid="deletion-contacted">
                      📞 {t("deletions.markContacted")}
                    </button>
                  </form>
                )}
                <div className="flex flex-wrap gap-2">
                  {d.status === "pending" && (
                    <form action={deletionAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="what" value="confirm" />
                      <ConfirmButton message={late ? t("deletions.confirmNowConfirm") : t("deletions.confirmConfirm", { date: dt(d.effectiveAt) })} className="min-h-11 rounded-lg bg-red-700 px-4 font-bold text-white" data-testid="deletion-confirm">
                        {t("deletions.confirm")}
                      </ConfirmButton>
                    </form>
                  )}
                  {open && (
                    <form action={deletionAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="what" value="refuse" />
                      <button className="min-h-11 rounded-lg border border-border bg-surface px-4 font-semibold" data-testid="deletion-refuse">
                        {t("deletions.refuse")}
                      </button>
                    </form>
                  )}
                  {d.status === "deleted" && (
                    <form action={deletionAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="what" value="restore" />
                      <button className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground" data-testid="deletion-restore">
                        ♻️ {t("deletions.restore")}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

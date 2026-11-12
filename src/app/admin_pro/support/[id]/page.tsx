import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { STATUS_CHIP, URGENCY_CHIP } from "@/components/admin/support-chips";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { hasPerm } from "@/lib/admin/access";
import { adminI18n } from "@/lib/admin/i18n";
import { requireSuperadminPage } from "@/lib/auth/context";
import { formatBfPhone, telHref, whatsappHref } from "@/lib/format";
import { STATUSES, adminRequest } from "@/lib/support/requests";
import { deviceFromUa } from "@/lib/usage/device";
import { supportReplyAction } from "../../actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";

/** One request: who, which business, when, from which screen; the conversation and the answer. */
export default async function AdminSupportRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sa = await requireSuperadminPage("support");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [{ t, format }, r, sp] = await Promise.all([adminI18n(), adminRequest(getDb(), id.data), searchParams]);
  if (!r) notFound();
  const phone = r.contact && /^\+?[\d\s]{6,}$/.test(r.contact) ? r.contact : null;
  const dev = deviceFromUa(r.userAgent);
  const dt = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium", timeStyle: "short" }) : "—");
  const mins = (a: Date, b: Date | null) => (b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000)) : null);
  const firstMin = mins(r.createdAt, r.firstResponseAt);
  return (
    <div className="flex flex-col gap-5" data-testid="admin-support-request">
      <Link href="/admin_pro/support" className="text-sm font-semibold text-primary">
        ← {t("support.title")}
      </Link>
      {sp.ok === "supportSaved" && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t("ok.supportSaved")}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {t("errorInvalid")}
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-bold ${URGENCY_CHIP[r.urgency as "low"] ?? ""}`}>{t(`support.urgencies.${r.urgency as "low"}`)}</span>
            <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_CHIP[r.status] ?? ""}`} data-testid="admin-support-status">
              {t(`support.statuses.${r.status as "new"}`)}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{t(`support.categories.${r.category as "bug"}`)}</span>
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">{r.subject}</h1>
          <p className="font-mono text-sm text-muted-foreground">{r.ref}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone && (
            <a href={whatsappHref(phone, t("support.waHello", { name: r.name, ref: r.ref })) ?? "#"} target="_blank" rel="noopener" className={`${btn} bg-[#25D366] text-black`}>
              💬 WhatsApp
            </a>
          )}
          {phone && (
            <a href={telHref(phone)} className={`${btn} border border-border bg-surface`}>
              📞 {formatBfPhone(phone)}
            </a>
          )}
          {r.restaurantId && hasPerm(sa, "recovery") && (r.category === "access" || r.source === "public") && (
            <Link href={`/admin_pro/recovery?business=${r.restaurantId}&request=${r.id}`} className={`${btn} bg-nuit text-creme`} data-testid="admin-start-recovery">
              🔐 {t("support.startRecovery")}
            </Link>
          )}
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">{t("support.conversation")}</CardTitle>
          <ol className="flex flex-col gap-2" data-testid="admin-support-messages">
            {r.messages.map((m) => (
              <li key={m.id} className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.from === "admin" ? "self-end bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50" : "self-start bg-muted"}`}>
                <p className="text-xs font-semibold opacity-70">
                  {m.author} · {dt(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
          <form action={supportReplyAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4" data-testid="admin-support-reply">
            <input type="hidden" name="id" value={r.id} />
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("support.answer")}</span>
              <textarea name="body" maxLength={4000} rows={4} placeholder={t("support.answerPlaceholder")} className={`${field} py-2`} data-testid="admin-support-body" />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("support.status")}</span>
                <select name="status" defaultValue={r.status === "new" ? "in_progress" : r.status} className={field} data-testid="admin-support-status-select">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`support.statuses.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="assign" value="1" defaultChecked={!r.assignedTo} className="size-5" />
                {t("support.assignMe")}
              </label>
              <button className={`${btn} bg-primary text-primary-foreground`} data-testid="admin-support-send">
                {t("support.send")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("support.answerHint")}</p>
          </form>
        </Card>

        <Card className="flex flex-col gap-3 text-sm">
          <CardTitle>{t("support.details")}</CardTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">{t("support.cols.business")}</dt>
            <dd className="font-semibold" data-testid="admin-support-business">
              {r.restaurantId && r.business ? (
                <Link href={`/admin_pro/businesses/${r.restaurantId}`} className="text-primary">
                  {r.business}
                </Link>
              ) : (
                <span className="text-amber-700">{t("support.noMatch", { rc: r.rcCode ?? "—" })}</span>
              )}
              {r.city && <span className="block text-xs font-normal text-muted-foreground">{r.city}</span>}
            </dd>
            {r.rcCode && (
              <>
                <dt className="text-muted-foreground">RC</dt>
                <dd className="font-mono">RC-{r.rcCode}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("support.cols.from")}</dt>
            <dd>
              {r.name}
              {r.role && <span className="text-muted-foreground"> · {t(`roles.${r.role as "owner"}`)}</span>}
            </dd>
            <dt className="text-muted-foreground">{t("support.contact")}</dt>
            <dd>{r.contact ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("support.source")}</dt>
            <dd>{r.source === "public" ? t("support.public") : t("support.app")}</dd>
            {r.pageUrl && (
              <>
                <dt className="text-muted-foreground">{t("support.screen")}</dt>
                <dd className="break-all font-mono text-xs">{r.pageUrl}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("support.device")}</dt>
            <dd>
              {t(`live.devices.${dev.device}`)} · {t(`live.os.${dev.os}`)}
            </dd>
            <dt className="text-muted-foreground">{t("support.cols.received")}</dt>
            <dd>{dt(r.createdAt)}</dd>
            <dt className="text-muted-foreground">{t("support.firstAnswer")}</dt>
            <dd>{r.firstResponseAt ? `${dt(r.firstResponseAt)} · ${t("support.after", { n: firstMin ?? 0 })}` : t("support.notYet")}</dd>
            <dt className="text-muted-foreground">{t("support.resolvedAt")}</dt>
            <dd>{dt(r.resolvedAt)}</dd>
            <dt className="text-muted-foreground">{t("support.assigned")}</dt>
            <dd>{r.assignedTo ?? "—"}</dd>
          </dl>
        </Card>
      </section>
    </div>
  );
}

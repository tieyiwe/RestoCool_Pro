import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { ADMIN_PERMS, ROLE_PERMS, type AdminPerm } from "@/lib/admin/access";
import { adminI18n } from "@/lib/admin/i18n";
import { activitySummary, canGive, consoleOwners, grantableRoles, listCollaborators } from "@/lib/admin/team";
import { requireSuperadminPage } from "@/lib/auth/context";
import { inviteLinks } from "@/lib/email/collaborator-invite";
import { publicBaseUrl } from "@/lib/urls";
import { addCollaboratorAction, removeCollaboratorAction, resendInviteAction, updateCollaboratorAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";
const OK = ["collabAdded", "collabSaved", "collabRemoved", "inviteResent"];
const ROLE_CHIP: Record<string, string> = {
  superadmin: "bg-nuit text-creme",
  manager: "bg-emerald-100 text-emerald-900",
  support: "bg-sky-100 text-sky-900",
  sales: "bg-amber-100 text-amber-900",
  analyst: "bg-violet-100 text-violet-900",
  custom: "bg-muted",
};

/** Who works in the console: roles, rights, invitations, and what each person did. */
export default async function AdminTeam({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; invite?: string }> }) {
  const sa = await requireSuperadminPage("team");
  const db = getDb();
  const [{ t, format }, list, sp, summary, base] = await Promise.all([adminI18n(), listCollaborators(db), searchParams, activitySummary(db), publicBaseUrl()]);
  const roles = grantableRoles(sa, sa.perms);
  const give = (p: AdminPerm) => canGive(sa, sa.perms, p);
  const perm = (p: string) => t(`team.perms.${p.replace(".", "_")}` as "team.perms.dashboard");
  const role = (r: string) => t(`team.roles.${r}` as "team.roles.support");
  const links = inviteLinks(base);
  const stats = (email: string) => summary.get(email);
  return (
    <div className="flex flex-col gap-6" data-testid="admin-team-page">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("team.title")}</h1>
          <p className="text-muted-foreground">{t("team.intro")}</p>
        </div>
        <Link href="/admin_pro/team/activity" className={`${btn} flex items-center border border-border bg-surface`} data-testid="team-activity-link">
          🧾 {t("team.activityAll")}
        </Link>
      </div>
      {sp.ok && OK.includes(sp.ok) && (
        <div role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.collabAdded")}
          {sp.invite && (
            <p className="mt-1 text-sm" data-testid="invite-status">
              {sp.invite === "sent" ? `✉️ ${t("team.inviteSent")}` : sp.invite === "skipped" ? `⚠️ ${t("team.inviteSkipped")}` : `⚠️ ${t("team.inviteFailed")}`}
            </p>
          )}
        </div>
      )}
      {sp.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900" data-testid="admin-error">
          {sp.error === "forbidden" ? t("team.forbidden") : t("errorInvalid")}
        </p>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>➕ {t("team.add")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("team.addHint")}</p>
        <form action={addCollaboratorAction} className="grid gap-3 md:grid-cols-2" data-testid="admin-collab-form">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("team.email")}</span>
            <input name="email" type="email" required maxLength={200} className={field} data-testid="collab-email" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("team.name")}</span>
            <input name="name" maxLength={80} className={field} data-testid="collab-name" />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("team.roleTitle")}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((r) => (
                <label key={r} className="flex min-h-16 cursor-pointer items-start gap-2 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name="role" value={r} defaultChecked={r === "support"} required className="mt-0.5 size-5" data-testid={`collab-role-${r}`} />
                  <span>
                    <span className="block font-bold">
                      {r === "superadmin" ? "👑 " : ""}
                      {role(r)}
                    </span>
                    <span className="text-xs text-muted-foreground">{r === "custom" ? t("team.roleCustomHint") : ROLE_PERMS[r].map(perm).join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <details className="md:col-span-2">
            <summary className="cursor-pointer text-sm font-semibold">{t("team.permsTitle")}</summary>
            <p className="mt-1 text-xs text-muted-foreground">{t("team.permsCustomHint")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ADMIN_PERMS.filter(give).map((p) => (
                <label key={p} className="flex min-h-11 items-start gap-2 rounded-lg border border-border p-2 text-sm">
                  <input type="checkbox" name="perms" value={p} className="mt-1 size-5" />
                  <span>
                    <span className="block font-semibold">{perm(p)}</span>
                    <span className="text-xs text-muted-foreground">{t(`team.permsHint.${p.replace(".", "_")}` as "team.permsHint.dashboard")}</span>
                  </span>
                </label>
              ))}
            </div>
          </details>
          <button className={`${btn} bg-primary text-primary-foreground md:col-span-2`} data-testid="collab-add">
            ✉️ {t("team.addSubmit")}
          </button>
        </form>
      </Card>

      <Card>
        <CardTitle className="mb-3">👑 {t("team.owners")}</CardTitle>
        <p className="mb-2 text-sm text-muted-foreground">{t("team.ownersHint")}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {consoleOwners().map((e) => (
            <li key={e} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{e}</span>
              {e === sa.email && <span className="rounded bg-muted px-1.5 text-xs">{t("team.you")}</span>}
              <Link href={`/admin_pro/team/activity?who=${encodeURIComponent(e)}`} className="text-xs font-semibold text-primary">
                {t("team.activity", { n: stats(e)?.changes ?? 0 })}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <section className="flex flex-col gap-3" data-testid="admin-collabs">
        <h2 className="text-lg font-bold">{t("team.collaborators", { n: list.length })}</h2>
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t("team.none")}</p>}
        {list.map((c) => {
          const self = c.email === sa.email;
          const locked = self || (!sa.owner && (c.role === "superadmin" || c.perms.some((p) => !give(p as AdminPerm))));
          const st = stats(c.email);
          return (
            <Card key={c.id} id={`c-${c.id}`} className="flex scroll-mt-20 flex-col gap-3" data-testid="admin-collab">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {c.name ?? c.email}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_CHIP[c.role] ?? ROLE_CHIP.custom}`} data-testid="collab-role">
                      {role(c.role)}
                    </span>
                    {!c.active && <span className="rounded bg-red-100 px-1.5 text-xs text-red-900">{t("team.disabled")}</span>}
                    {self && <span className="rounded bg-muted px-1.5 text-xs">{t("team.you")}</span>}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{c.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("team.meta", { by: c.addedBy, date: format.dateTime(c.createdAt, { dateStyle: "medium" }) })} · {c.lastSeenAt ? t("team.lastSeen", { when: format.relativeTime(c.lastSeenAt) }) : t("team.neverSeen")}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="collab-invite">
                    ✉️{" "}
                    {c.invitedAt
                      ? t(`team.inviteState.${(c.inviteStatus ?? "sent") as "sent"}`, { date: format.dateTime(c.invitedAt, { dateStyle: "medium", timeStyle: "short" }), n: c.inviteCount })
                      : t("team.inviteState.none")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin_pro/team/activity?who=${encodeURIComponent(c.email)}`} className={`${btn} flex items-center border border-border bg-surface text-sm`} data-testid="collab-activity">
                    🧾 {t("team.activity", { n: st?.changes ?? 0 })}
                  </Link>
                  {!locked && (
                    <>
                      <form action={resendInviteAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className={`${btn} border border-border bg-surface text-sm`} data-testid="collab-resend">
                          ✉️ {t("team.resend")}
                        </button>
                      </form>
                      <form action={updateCollaboratorAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <button className={`${btn} border border-border bg-surface text-sm`} data-testid="collab-toggle">
                          {c.active ? t("team.disable") : t("team.enable")}
                        </button>
                      </form>
                      <form action={removeCollaboratorAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton message={t("team.removeConfirm", { email: c.email })} className={`${btn} bg-red-700 text-sm text-white`}>
                          {t("team.remove")}
                        </ConfirmButton>
                      </form>
                    </>
                  )}
                </div>
              </div>
              <form action={updateCollaboratorAction} className="flex flex-col gap-3 border-t border-border pt-3" data-testid="collab-edit">
                <input type="hidden" name="id" value={c.id} />
                <label className="text-sm sm:max-w-sm">
                  <span className="mb-1 block font-semibold">{t("team.roleTitle")}</span>
                  <select name="role" defaultValue={c.role} disabled={locked} className={field} data-testid="collab-role-select">
                    {[...new Set([...roles, c.role])].map((r) => (
                      <option key={r} value={r} disabled={!roles.includes(r as never)}>
                        {role(r)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted-foreground">{t("team.roleChangeHint")}</span>
                </label>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  {ADMIN_PERMS.map((p) => (
                    <label key={p} className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm ${c.perms.includes(p) ? "bg-emerald-50 font-semibold text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100" : ""}`}>
                      <input type="checkbox" name="perms" value={p} defaultChecked={c.perms.includes(p)} disabled={locked || !give(p)} className="size-5" />
                      {perm(p)}
                    </label>
                  ))}
                </div>
                {!locked && (
                  <button className={`${btn} self-start border border-border bg-surface`} data-testid="collab-save">
                    {t("team.save")}
                  </button>
                )}
              </form>
              {c.inviteStatus !== "sent" && !locked && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold">{t("team.shareLinks")}</summary>
                  <p className="mt-1 break-all font-mono">{links.signUp}</p>
                  <p className="mt-1 break-all font-mono">{links.signIn}</p>
                </details>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}

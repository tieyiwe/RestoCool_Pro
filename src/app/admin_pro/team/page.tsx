import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { ADMIN_PERMS, OWNER_ONLY_PERMS, PERM_PRESETS, hasPerm } from "@/lib/admin/access";
import { adminI18n } from "@/lib/admin/i18n";
import { consoleOwners, listCollaborators } from "@/lib/admin/team";
import { requireSuperadminPage } from "@/lib/auth/context";
import { addCollaboratorAction, removeCollaboratorAction, updateCollaboratorAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-lg px-4 font-bold";
const OK = ["collabAdded", "collabSaved", "collabRemoved"];

/** Who else works in the console, and what each person may do. */
export default async function AdminTeam({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sa = await requireSuperadminPage("team");
  const [{ t, format }, list, sp] = await Promise.all([adminI18n(), listCollaborators(getDb()), searchParams]);
  const grantable = ADMIN_PERMS.filter((p) => sa.owner || (hasPerm(sa, p) && !OWNER_ONLY_PERMS.has(p)));
  const perm = (p: string) => t(`team.perms.${p.replace(".", "_")}` as "team.perms.dashboard");
  return (
    <div className="flex flex-col gap-6" data-testid="admin-team-page">
      <div>
        <h1 className="text-2xl font-extrabold">{t("team.title")}</h1>
        <p className="text-muted-foreground">{t("team.intro")}</p>
      </div>
      {sp.ok && OK.includes(sp.ok) && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="admin-ok">
          ✓ {t(`ok.${sp.ok}` as "ok.plan")}
        </p>
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
            <input name="name" maxLength={80} className={field} />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block font-semibold">{t("team.preset")}</span>
            <select name="preset" defaultValue="" className={field} data-testid="collab-preset">
              <option value="">{t("team.presetCustom")}</option>
              {Object.entries(PERM_PRESETS)
                .filter(([, ps]) => ps.every((p) => grantable.includes(p)))
                .map(([k, ps]) => (
                  <option key={k} value={k}>
                    {t(`team.presets.${k}` as "team.presets.support")} — {ps.map(perm).join(", ")}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t("team.permsTitle")}</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grantable.map((p) => (
                <label key={p} className="flex min-h-11 items-start gap-2 rounded-lg border border-border p-2 text-sm">
                  <input type="checkbox" name="perms" value={p} className="mt-1 size-5" />
                  <span>
                    <span className="block font-semibold">{perm(p)}</span>
                    <span className="text-xs text-muted-foreground">{t(`team.permsHint.${p.replace(".", "_")}` as "team.permsHint.dashboard")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className={`${btn} bg-primary text-primary-foreground md:col-span-2`} data-testid="collab-add">
            {t("team.addSubmit")}
          </button>
        </form>
      </Card>

      <Card>
        <CardTitle className="mb-3">👑 {t("team.owners")}</CardTitle>
        <p className="mb-2 text-sm text-muted-foreground">{t("team.ownersHint")}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {consoleOwners().map((e) => (
            <li key={e} className="font-mono">
              {e}
              {e === sa.email && <span className="ml-2 rounded bg-muted px-1.5 text-xs font-sans">{t("team.you")}</span>}
            </li>
          ))}
        </ul>
      </Card>

      <section className="flex flex-col gap-3" data-testid="admin-collabs">
        <h2 className="text-lg font-bold">{t("team.collaborators", { n: list.length })}</h2>
        {list.length === 0 && <p className="text-sm text-muted-foreground">{t("team.none")}</p>}
        {list.map((c) => {
          const self = c.email === sa.email;
          const locked = self || (!sa.owner && c.perms.some((p) => OWNER_ONLY_PERMS.has(p as never)));
          return (
            <Card key={c.id} className="flex flex-col gap-3" data-testid="admin-collab">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {c.name ?? c.email}
                    {!c.active && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-900">{t("team.disabled")}</span>}
                    {self && <span className="ml-2 rounded bg-muted px-1.5 text-xs">{t("team.you")}</span>}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{c.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("team.meta", { by: c.addedBy, date: format.dateTime(c.createdAt, { dateStyle: "medium" }) })} · {c.lastSeenAt ? t("team.lastSeen", { when: format.relativeTime(c.lastSeenAt) }) : t("team.neverSeen")}
                  </p>
                </div>
                {!locked && (
                  <div className="flex gap-2">
                    <form action={updateCollaboratorAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                      <button className={`${btn} border border-border bg-surface`} data-testid="collab-toggle">
                        {c.active ? t("team.disable") : t("team.enable")}
                      </button>
                    </form>
                    <form action={removeCollaboratorAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message={t("team.removeConfirm", { email: c.email })} className={`${btn} bg-red-700 text-white`}>
                        {t("team.remove")}
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </div>
              <form action={updateCollaboratorAction} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  {ADMIN_PERMS.map((p) => (
                    <label key={p} className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm ${c.perms.includes(p) ? "bg-emerald-50 font-semibold text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100" : ""}`}>
                      <input type="checkbox" name="perms" value={p} defaultChecked={c.perms.includes(p)} disabled={locked || !grantable.includes(p)} className="size-5" />
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
            </Card>
          );
        })}
      </section>
    </div>
  );
}

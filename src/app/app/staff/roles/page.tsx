import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { ACCESS_AREAS, ROLE_GROUPS } from "@/lib/auth/access";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { listJobRoles } from "@/lib/personnel/roles";
import { createRoleAction, deleteRoleAction, saveRoleAccessAction } from "./actions";

export const dynamic = "force-dynamic";

const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const OK = ["created", "saved", "deleted"];
const ERR = ["invalid", "forbidden", "notFound", "duplicate", "inUse"];

/**
 * « Rôles et accès »: the roles of the restaurant (catalog + roles the owner typed in) and, for
 * each one, what it opens in the app. The owner edits; managers see it read-only.
 */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("staff.write");
  const t = await getTranslations("roles");
  const sp = await searchParams;
  const ok = sp.ok && OK.includes(sp.ok) ? sp.ok : null;
  const error = sp.error && ERR.includes(sp.error) ? sp.error : null;
  const rid = ctx.repo.restaurantId;
  const owner = can(ctx.actor, "managers.write", { restaurantId: rid });
  const roles = await listJobRoles(getDb(), rid);
  const label = (r: { key: string | null; name: string | null }) => (r.key ? t(`names.${r.key}` as "names.server") : (r.name ?? "—"));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/app/staff" className="text-sm font-semibold text-primary">
          ← {t("back")}
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{owner ? t("intro") : t("introReadOnly")}</p>
      </div>
      {ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="roles-ok">
          {t(`ok.${ok}` as "ok.saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900" data-testid="roles-error">
          {t(`err.${error}` as "err.invalid")}
        </p>
      )}

      {ROLE_GROUPS.map((g) => {
        const list = roles.filter((r) => r.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="flex flex-col gap-3" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="text-lg font-bold">
              {t(`groups.${g}`)}
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((r) => (
                <Card key={r.id} className="flex flex-col gap-3" data-testid="role-card" data-role={r.key ?? r.name ?? ""}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold">{label(r)}</h3>
                    <span className="text-xs text-muted-foreground">{t("holders", { n: r.holders })}</span>
                  </div>
                  <form action={saveRoleAccessAction} className="flex flex-col gap-3">
                    <input type="hidden" name="id" value={r.id} />
                    <fieldset className="flex flex-wrap gap-2" disabled={!owner}>
                      <legend className="sr-only">{t("accessFor", { role: label(r) })}</legend>
                      {ACCESS_AREAS.map((a) => (
                        <label
                          key={a}
                          title={t(`areaHints.${a}`)}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-semibold has-[:disabled]:cursor-default"
                        >
                          <input type="checkbox" name="access" value={a} defaultChecked={r.access.includes(a)} className="size-4 accent-[var(--color-primary)]" data-testid={`access-${a}`} />
                          {t(`areas.${a}`)}
                        </label>
                      ))}
                    </fieldset>
                    {r.access.length === 0 && <p className="text-xs text-muted-foreground">{t("noAccess")}</p>}
                    {owner && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="submit" data-testid="role-save">
                          {t("save")}
                        </Button>
                      </div>
                    )}
                  </form>
                  {owner && r.holders === 0 && (
                    <form action={deleteRoleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton message={t("deleteConfirm", { role: label(r) })} className="min-h-11 text-sm text-muted-foreground underline-offset-2 hover:underline">
                        {t("delete")}
                      </ConfirmButton>
                    </form>
                  )}
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {owner && (
        <Card>
          <CardTitle className="mb-1">{t("create")}</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">{t("createHint")}</p>
          <form action={createRoleAction} className="flex flex-col gap-3" data-testid="create-role">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("name")}</span>
                <input name="name" required minLength={2} maxLength={40} placeholder={t("namePlaceholder")} className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("group")}</span>
                <select name="group" className={input} defaultValue="front">
                  {ROLE_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {t(`groups.${g}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-1 text-sm font-semibold">{t("access")}</legend>
              {ACCESS_AREAS.map((a) => (
                <label key={a} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-semibold">
                  <input type="checkbox" name="access" value={a} className="size-4" />
                  {t(`areas.${a}`)}
                </label>
              ))}
            </fieldset>
            <div>
              <Button type="submit">{t("createSubmit")}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="bg-muted/40">
        <CardTitle className="mb-2 text-base">{t("legend")}</CardTitle>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {ACCESS_AREAS.map((a) => (
            <div key={a}>
              <dt className="font-semibold">{t(`areas.${a}`)}</dt>
              <dd className="text-muted-foreground">{t(`areaHints.${a}`)}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

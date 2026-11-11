import { brandedQrSvg } from "@/lib/qr-branded";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { ensureMainCode, formatRc } from "@/lib/access-codes";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { formatStaffNo, handledCounts, personnel } from "@/lib/personnel";
import { listJobRoles } from "@/lib/personnel/roles";
import { ROLE_GROUPS } from "@/lib/auth/access";
import { assignRoleAction } from "./roles/actions";
import { ensureJoinToken, pendingJoinRequests } from "@/lib/personnel/join";
import { formatBfPhone } from "@/lib/format";
import { acceptJoinAction, declineJoinAction } from "./actions";
import { attendanceEnabled, attendanceLog, ensureAttendanceToken } from "@/lib/personnel/attendance";
import { publicBaseUrl } from "@/lib/urls";
import { addPersonAction, punchPersonAction, regenerateQrAction, setActivePersonAction, setPinAction } from "./actions";

export const dynamic = "force-dynamic";

const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const TZ = "Africa/Ouagadougou";

/**
 * Personnel: matricules, check-in (« pointage ») with presence and hours, orders handled.
 * People without an email are added here with a PIN; managers can check anyone in or out.
 */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; no?: string }> }) {
  const ctx = await requireMemberPage("staff.write");
  const t = await getTranslations("personnel");
  const ta = await getTranslations("attendance");
  const tp = await getTranslations("personnelAdmin");
  const tr = await getTranslations("app.role");
  const tro = await getTranslations("roles");
  const format = await getFormatter();
  const sp = await searchParams;
  // Messages come from the URL: only known ones are shown (no raw keys on screen).
  const ok = sp.ok && ["added", "pin", "in", "out", "qr", "status", "role", "joined", "declined", "joinQr"].includes(sp.ok) ? sp.ok : null;
  const error = sp.error && ["invalid", "forbidden", "notFound"].includes(sp.error) ? sp.error : null;
  const no = sp.no;
  // The owner and managers are changed by the owner only (managers.write).
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const r = (await ctx.repo.restaurant.get())!;
  const enabled = attendanceEnabled(r);
  const since = new Date(Date.now() - 7 * 24 * 3600_000);
  const [jobRoles, pending] = await Promise.all([listJobRoles(db, rid), pendingJoinRequests(db, rid)]);
  const tj = await getTranslations("join.owner");
  const joinQr = brandedQrSvg(`${await publicBaseUrl()}/rejoindre/${await ensureJoinToken(db, r)}`);
  const [people, counts, log] = await Promise.all([personnel(db, rid), handledCounts(db, rid, since), enabled ? attendanceLog(db, rid, 7) : Promise.resolve([])]);
  const roleLabel = (r: { key: string | null; name: string | null }) => (r.key ? tro(`names.${r.key}` as "names.server") : (r.name ?? "—"));
  const personRole = (p: (typeof people)[number]) => (p.role === "owner" ? tr("owner") : p.jobRoleId ? roleLabel({ key: p.jobRoleKey, name: p.jobRoleName }) : tr(p.role as "server"));
  const open = new Map(log.filter((l) => !l.checkOutAt).map((l) => [l.memberId, l]));
  const totals = new Map<string, number>();
  for (const l of log) totals.set(l.memberId, (totals.get(l.memberId) ?? 0) + l.minutes);
  const nameOf = new Map(people.map((p) => [p.id, `${p.name} · ${formatStaffNo(p.staffNo)}`]));
  const hours = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  const time = (d: Date) => format.dateTime(d, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = (d: Date) => format.dateTime(d, { weekday: "short", day: "numeric", month: "short", timeZone: TZ });

  let qrSvg = "";
  let rc = "";
  if (enabled) {
    const [token, code] = await Promise.all([ensureAttendanceToken(db, r), ensureMainCode(db, rid)]);
    qrSvg = brandedQrSvg(`${await publicBaseUrl()}/pointage/${token}`);
    rc = formatRc(code);
  }
  const now = Date.now();
  // Only the owner changes a manager's (or the owner's) PIN or status; the server checks it too.
  const canLeads = can(ctx.actor, "managers.write", { restaurantId: rid });
  // Roles a manager may give: those that don't manage the personnel (the owner gives those).
  const assignable = jobRoles.filter((jr) => canLeads || !jr.access.includes("staff"));
  const roleOptions = ROLE_GROUPS.map((g) => ({ g, list: assignable.filter((jr) => jr.group === g) })).filter((x) => x.list.length);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="#add" data-testid="add-staff-button">
              ➕ {tj("addButton")}
            </a>
          </Button>
          {can(ctx.actor, "devices.write", { restaurantId: rid }) && (
            <Button asChild variant="outline">
              <Link href="/app/staff/devices" data-testid="devices-link">
                📟 {tj("devices")}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/app/staff/roles" data-testid="roles-link">
              🔑 {tro("manage")}
            </Link>
          </Button>
        </div>
      </div>
      {ok && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="staff-ok">
          {tp(`ok.${ok}` as "ok.pin", { no: formatStaffNo(Number(no)) })}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {tp(`err.${error}` as "err.invalid")}
        </p>
      )}

      {/* « Ajouter du personnel »: the onboarding QR the new person scans, right here. */}
      <Card id="add" className="scroll-mt-20 flex flex-col gap-4 border-2 border-primary/30 sm:flex-row sm:items-center" data-testid="add-staff">
        <div className="mx-auto w-44 shrink-0 rounded-2xl border-4 border-primary bg-white p-2 sm:mx-0" role="img" aria-label={tj("invite")} data-testid="add-staff-qr" dangerouslySetInnerHTML={{ __html: joinQr }} />
        <div className="flex min-w-0 flex-col gap-2">
          <CardTitle>➕ {tj("addTitle")}</CardTitle>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{tj("addStep1")}</li>
            <li>{tj("addStep2")}</li>
            <li>{tj("addStep3")}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/staff/invite" data-testid="invite-link">
                📲 {tj("fullScreen")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="#add-manual">✍️ {tj("manual")}</a>
            </Button>
          </div>
        </div>
      </Card>

      {/* People who scanned the team QR and wait for an answer */}
      {pending.length > 0 && (
        <Card id="join" className="scroll-mt-20 border-2 border-or bg-or/10" data-testid="join-requests">
          <CardTitle className="mb-1">🙋 {tj("title", { n: pending.length })}</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">{tj("intro")}</p>
          <ul className="flex flex-col gap-3">
            {pending.map((j) => (
              <li key={j.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" data-testid="join-request">
                <div>
                  <p className="font-bold">{j.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <a href={`tel:+${j.phone}`} className="underline-offset-2 hover:underline">
                      {formatBfPhone(j.phone).startsWith("+") ? formatBfPhone(j.phone) : `+${j.phone}`}
                    </a>
                    {" · "}
                    {time(j.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={acceptJoinAction} className="flex flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={j.id} />
                    <select name="roleId" required defaultValue={(jobRoles.find((jr) => jr.key === "server") ?? jobRoles.find((jr) => jr.key === "hostess"))?.id} aria-label={tj("roleFor", { name: j.name })} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-base" data-testid="join-role">
                      {roleOptions.map(({ g, list }) => (
                        <optgroup key={g} label={tro(`groups.${g}`)}>
                          {list.map((jr) => (
                            <option key={jr.id} value={jr.id}>
                              {roleLabel(jr)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <Button type="submit" data-testid="join-accept">
                      ✓ {tj("accept")}
                    </Button>
                  </form>
                  <form action={declineJoinAction}>
                    <input type="hidden" name="id" value={j.id} />
                    <ConfirmButton message={tj("declineConfirm", { name: j.name })} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-800 hover:bg-red-50" data-testid="join-decline">
                      {tj("decline")}
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Check-in QR */}
      {enabled ? (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-start" data-testid="attendance-qr">
          <div className="mx-auto w-36 shrink-0 rounded-lg border border-border bg-white p-2 sm:mx-0" aria-hidden dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="text-lg font-bold">{ta("qrTitle")}</h2>
            <p className="text-sm">{ta("qrText")}</p>
            <p className="text-sm text-muted-foreground">{ta("orRc", { rc })}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/app/staff/qr">🖨️ {ta("print")}</Link>
              </Button>
              <form action={regenerateQrAction}>
                <ConfirmButton message={ta("regenerateConfirm")} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">
                  {ta("regenerate")}
                </ConfirmButton>
              </form>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="bg-muted/40 text-sm" data-testid="attendance-off">
          {ta("disabled")}{" "}
          <Link href="/app/settings#features" className="font-semibold underline">
            →
          </Link>
        </Card>
      )}

      {/* Personnel */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-sm" data-testid="personnel-table">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2">{t("staffNo")}</th>
              <th className="px-3 py-2">{t("name")}</th>
              {enabled && <th className="px-3 py-2">{ta("title")}</th>}
              <th className="px-3 py-2 text-right">{t("served")}</th>
              {enabled && <th className="px-3 py-2 text-right">{ta("total")}</th>}
              <th className="px-3 py-2">PIN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map((p) => {
              const here = open.get(p.id);
              const editable = canLeads || (p.role !== "owner" && p.role !== "manager");
              const pinEditable = editable || p.id === ctx.memberships.find((x) => x.restaurantId === rid)?.memberId;
              const locked = p.lockedUntil && p.lockedUntil.getTime() > now;
              return (
                <tr key={p.id} data-testid="personnel-row" data-staff-no={p.staffNo ?? ""} className={p.active ? "" : "opacity-60"}>
                  <td className="px-3 py-2 align-top font-mono text-base font-bold" data-testid="staff-no">
                    {formatStaffNo(p.staffNo)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs text-muted-foreground" data-testid="person-role">
                      {personRole(p)}
                      {p.hasLogin ? ` · ${tp("loginEmail")}` : ""}
                    </span>
                    {editable && p.role !== "owner" && (
                      <form action={assignRoleAction} className="mt-1 flex items-center gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <select name="roleId" defaultValue={p.jobRoleId ?? ""} aria-label={tro("roleOf", { name: p.name })} className="min-h-11 max-w-40 rounded-lg border border-border bg-surface px-2 text-sm" data-testid="role-select">
                          {!p.jobRoleId && <option value="">—</option>}
                          {roleOptions.map(({ g, list }) => (
                            <optgroup key={g} label={tro(`groups.${g}`)}>
                              {list.map((jr) => (
                                <option key={jr.id} value={jr.id}>
                                  {roleLabel(jr)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted" data-testid="role-assign">
                          {tro("change")}
                        </button>
                      </form>
                    )}
                    {!p.active && (
                      <Badge variant="muted" className="mt-1">
                        {t("inactive")}
                      </Badge>
                    )}
                    {locked && (
                      <Badge variant="warning" className="mt-1">
                        {ta("locked")}
                      </Badge>
                    )}
                  </td>
                  {enabled && (
                    <td className="px-3 py-2 align-top" data-testid="presence">
                      {here ? (
                        <span className="font-semibold text-emerald-700">
                          ● {ta("present")} <span className="font-normal text-muted-foreground">{ta("since", { time: time(here.checkInAt) })}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">○ {ta("absent")}</span>
                      )}
                      {p.active && (
                        <form action={punchPersonAction} className="mt-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="action" value={here ? "out" : "in"} />
                          <button className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" data-testid="manual-punch">
                            {here ? ta("checkOut") : ta("checkIn")}
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right align-top tabular-nums">{counts.get(p.id)?.served ?? 0}</td>
                  {enabled && <td className="px-3 py-2 text-right align-top tabular-nums">{hours(totals.get(p.id) ?? 0)}</td>}
                  <td className="px-3 py-2 align-top">
                    {pinEditable && (
                      <form action={setPinAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          name="pin"
                          inputMode="numeric"
                          pattern="\d{4,6}"
                          maxLength={6}
                          required
                          placeholder={p.hasPin ? "••••" : tp("noPin")}
                          aria-label={`${tp("setPin")} · ${p.name}`}
                          className="min-h-11 w-24 rounded-lg border border-border bg-surface px-2 text-base"
                        />
                        <button className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted">{tp("savePin")}</button>
                      </form>
                    )}
                    {editable && p.role !== "owner" && (
                      <form action={setActivePersonAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                        <button className="min-h-11 text-xs text-muted-foreground underline-offset-2 hover:underline">{p.active ? tp("deactivate") : tp("activate")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Add a person by hand (no phone at hand, or no smartphone) */}
      <Card id="add-manual" className="scroll-mt-20">
        <CardTitle className="mb-1">{tp("add")}</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">{tp("addHint")}</p>
        <form action={addPersonAction} className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end" data-testid="add-person">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tp("name")}</span>
            <input name="name" required minLength={2} maxLength={60} className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tp("role")}</span>
            <select name="jobRoleId" className={input} defaultValue={(jobRoles.find((jr) => jr.key === "server") ?? jobRoles.find((jr) => jr.key === "hostess"))?.id} data-testid="new-person-role">
              {roleOptions.map(({ g, list }) => (
                <optgroup key={g} label={tro(`groups.${g}`)}>
                  {list.map((jr) => (
                    <option key={jr.id} value={jr.id}>
                      {roleLabel(jr)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tp("pin")}</span>
            <input name="pin" required inputMode="numeric" pattern="\d{4,6}" maxLength={6} className={input} />
          </label>
          <Button type="submit">{tp("submit")}</Button>
        </form>
      </Card>

      {/* Attendance log */}
      {enabled && (
        <Card className="overflow-x-auto p-0">
          <CardTitle className="p-4 pb-2">{ta("log")}</CardTitle>
          {log.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{ta("noLog")}</p>
          ) : (
            <table className="w-full min-w-[36rem] text-sm" data-testid="attendance-log">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">{t("name")}</th>
                  <th className="px-4 py-2">{ta("in")}</th>
                  <th className="px-4 py-2">{ta("out")}</th>
                  <th className="px-4 py-2 text-right">{ta("duration")}</th>
                  <th className="px-4 py-2">{ta("method")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {log.map((l) => (
                  <tr key={l.id} data-testid="attendance-row">
                    <td className="px-4 py-2">{nameOf.get(l.memberId) ?? "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {day(l.checkInAt)} · {time(l.checkInAt)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{l.checkOutAt ? time(l.checkOutAt) : <span className="font-semibold text-emerald-700">{ta("stillHere")}</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{hours(l.minutes)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {ta(`methods.${l.inMethod}` as "methods.qr")}
                      {l.outMethod ? ` / ${ta(`methods.${l.outMethod}` as "methods.qr")}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      <p className="text-sm text-muted-foreground">{t("period")}</p>
    </div>
  );
}

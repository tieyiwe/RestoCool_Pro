import QRCode from "qrcode";
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
  const format = await getFormatter();
  const sp = await searchParams;
  // Messages come from the URL: only known ones are shown (no raw keys on screen).
  const ok = sp.ok && ["added", "pin", "in", "out", "qr", "status"].includes(sp.ok) ? sp.ok : null;
  const error = sp.error && ["invalid", "forbidden", "notFound"].includes(sp.error) ? sp.error : null;
  const no = sp.no;
  // The owner and managers are changed by the owner only (managers.write).
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const r = (await ctx.repo.restaurant.get())!;
  const enabled = attendanceEnabled(r);
  const since = new Date(Date.now() - 7 * 24 * 3600_000);
  const [people, counts, log] = await Promise.all([personnel(db, rid), handledCounts(db, rid, since), enabled ? attendanceLog(db, rid, 7) : Promise.resolve([])]);
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
    qrSvg = await QRCode.toString(`${await publicBaseUrl()}/pointage/${token}`, { type: "svg", margin: 1, color: { dark: "#17231C", light: "#FFFFFF" } });
    rc = formatRc(code);
  }
  const now = Date.now();
  // Only the owner changes a manager's (or the owner's) PIN or status; the server checks it too.
  const canLeads = can(ctx.actor, "managers.write", { restaurantId: rid });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
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
                    <span className="block text-xs text-muted-foreground">
                      {tr(p.role)}
                      {p.hasLogin ? ` · ${tp("loginEmail")}` : ""}
                    </span>
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

      {/* Add a person without email */}
      <Card>
        <CardTitle className="mb-1">{tp("add")}</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">{tp("addHint")}</p>
        <form action={addPersonAction} className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end" data-testid="add-person">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tp("name")}</span>
            <input name="name" required minLength={2} maxLength={60} className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{tp("role")}</span>
            <select name="role" className={input}>
              {(["server", "kitchen", "cashier"] as const).map((role) => (
                <option key={role} value={role}>
                  {tr(role)}
                </option>
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

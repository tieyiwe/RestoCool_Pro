import { redirect } from "next/navigation";
import { brandedQrSvg } from "@/lib/qr-branded";
import { ensureMainCode, ensureSeatCodes, formatRc } from "@/lib/access-codes";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getDb } from "@/db";
import { pickText } from "@/i18n/config";
import { requireMemberPage } from "@/lib/auth/page";
import { hasFeature } from "@/lib/plan";
import { openSessions, SEAT_TYPES } from "@/lib/seating/admin";
import { codeEntryHost, menuUrl, publicBaseUrl, seatUrl } from "@/lib/urls";
import { StickerDownload } from "@/components/qr/sticker-download";
import { slugify } from "@/lib/slug";
import {
  addSeatAction,
  addTablesAction,
  closeSessionAction,
  createAreaAction,
  deleteAreaAction,
  deleteSeatAction,
  moveSeatAction,
  regenerateSeatAction,
  renameAreaAction,
  updateSeatAction,
} from "./actions";

const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3";
const btn = "min-h-11 min-w-11 rounded-lg px-2 text-sm font-semibold hover:bg-muted";
const label = "mb-1 block text-sm font-semibold";

export default async function SeatingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireMemberPage("seats.write");
  const t = await getTranslations("seating");
  const locale = await getLocale();
  const format = await getFormatter();
  const { ok, error } = await searchParams;
  const [r, areaRows, seatRows] = await Promise.all([ctx.repo.restaurant.get(), ctx.repo.seating.areas(), ctx.repo.seating.seats()]);
  if (!r) return null;
  // A bus company has buses and itineraries instead of tables and rooms.
  if (r.kind === "transport") redirect("/app/buses");
  const sessions = await openSessions({ db: getDb(), actor: ctx.actor, repo: ctx.repo });
  const base = await publicBaseUrl();
  const perSeatAllowed = hasFeature(r, "qrPerSeat");
  const perSeat = (r.settings.qrStrategy ?? "per_seat") === "per_seat" && perSeatAllowed;
  const [mainCode, seatCodes] = await Promise.all([
    ensureMainCode(getDb(), r.id),
    perSeat ? ensureSeatCodes(getDb(), r.id, seatRows.filter((s) => s.type === "table" || s.type === "room" || s.type === "area").map((s) => s.id)) : Promise.resolve(new Map<string, string>()),
  ]);
  const genericQr = brandedQrSvg(menuUrl(base, r.slug));
  const sticker = {
    scanMe: t("card.scanMe"),
    scanMeAlt: t("card.scanMeEn"),
    rcLabel: t("card.rcLabel"),
    noScan: t("card.noScan", { site: codeEntryHost(base) }),
    powered: t("card.poweredBy"),
  };
  const areaName = (id: string | null) => (id ? pickText(areaRows.find((a) => a.id === id)?.name, locale) : "");

  let okMessage: string | null = null;
  if (ok?.startsWith("tables:")) {
    const [, added, existing] = ok.split(":");
    okMessage = t("tablesAdded", { added: Number(added), existing: Number(existing) });
  } else if (ok === "regenerated") okMessage = t("regenerated");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {okMessage && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          ✓ {okMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {t(`errors.${["duplicate", "invalid"].includes(error) ? error : "unknown"}`)}
        </p>
      )}

      {/* QR strategy + printing */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start" data-testid="qr-card">
        {!perSeat && <div className="w-36 shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: genericQr }} />}
        <div className="flex flex-1 flex-col gap-3">
          <h2 className="text-lg font-bold">{perSeat ? t("qr") : t("genericTitle")}</h2>
          <p className="text-sm text-muted-foreground">{perSeat ? t("perSeatHint") : t("genericHint")}</p>
          <p className="text-sm">
            {t("mainCode")}{" "}
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-bold tracking-widest" data-testid="seating-main-code">
              {formatRc(mainCode)}
            </span>
          </p>
          {!perSeatAllowed && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t("planQr")}</p>}
          <div className="flex flex-wrap gap-2">
            {!perSeat && (
              <StickerDownload
                qrSrc="/api/app/qr?seat=generic"
                rc={formatRc(mainCode)}
                name={r.name}
                filename={`${r.slug}-qr-rc`}
                text={sticker}
                label={t("download")}
                className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted"
              />
            )}
          </div>
          <form action="/app/seating/print" className="flex flex-wrap items-end gap-2">
            <label>
              <span className={label}>{t("print")}</span>
              <select name="layout" className={input} defaultValue="tent">
                <option value="tent">{t("printTent")}</option>
                <option value="grid">{t("printGrid")}</option>
              </select>
            </label>
            <Button type="submit">🖨️ {t("print")}</Button>
          </form>
        </div>
      </Card>

      {/* Areas */}
      <Card>
        <h2 className="mb-3 text-lg font-bold">{t("areas")}</h2>
        {areaRows.length === 0 && <p className="mb-3 text-sm text-muted-foreground">{t("noAreas")}</p>}
        <ul className="mb-3 divide-y divide-border">
          {areaRows.map((a) => (
            <li key={a.id} className="py-2">
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
                  <span className="font-semibold">{pickText(a.name, locale)}</span>
                  <span className="text-sm text-primary">{t("edit")}</span>
                </summary>
                <div className="flex flex-wrap items-end gap-2 pt-2">
                  <form action={renameAreaAction} className="grid flex-1 gap-2 sm:grid-cols-4">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="fr" defaultValue={a.name.fr} required aria-label={`${t("areaName")} FR`} className={input} />
                    <input name="en" defaultValue={a.name.en ?? ""} placeholder="EN" aria-label={`${t("areaName")} EN`} className={input} />
                    <input name="zh" defaultValue={a.name.zh ?? ""} placeholder="中文" aria-label={`${t("areaName")} ZH`} className={input} />
                    <Button type="submit">{t("save")}</Button>
                  </form>
                  <form action={deleteAreaAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton message={t("confirmDelete")}>{t("delete")}</ConfirmButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <form action={createAreaAction} className="grid gap-2 sm:grid-cols-4">
          <input name="fr" required maxLength={60} placeholder={t("areaPlaceholder")} aria-label={t("areaName")} className={input} />
          <input name="en" maxLength={60} placeholder="EN" aria-label={`${t("areaName")} EN`} className={input} />
          <input name="zh" maxLength={60} placeholder="中文" aria-label={`${t("areaName")} ZH`} className={input} />
          <Button type="submit" variant="outline">
            + {t("addArea")}
          </Button>
        </form>
      </Card>

      {/* Add tables / rooms */}
      <Card className="grid gap-6 lg:grid-cols-2">
        <form action={addTablesAction} className="flex flex-col gap-2" data-testid="add-tables">
          <h2 className="text-lg font-bold">{t("addTables")}</h2>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={label}>{t("from")}</span>
              <input name="from" type="number" min={1} max={999} required defaultValue={1} className={input} />
            </label>
            <label>
              <span className={label}>{t("to")}</span>
              <input name="to" type="number" min={1} max={999} required defaultValue={10} className={input} />
            </label>
          </div>
          <label>
            <span className={label}>{t("skip")}</span>
            <input name="skip" placeholder={t("skipPlaceholder")} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <AreaSelect areas={areaRows} locale={locale} noArea={t("noArea")} label={t("area")} />
            <label>
              <span className={label}>{t("capacity")}</span>
              <input name="capacity" type="number" min={1} max={500} placeholder="4" className={input} />
            </label>
          </div>
          <Button type="submit">{t("addTablesBtn")}</Button>
        </form>
        <form action={addSeatAction} className="flex flex-col gap-2" data-testid="add-seat">
          <h2 className="text-lg font-bold">{t("addSeat")}</h2>
          <label>
            <span className={label}>{t("type")}</span>
            <select name="type" className={input} defaultValue="room">
              {(["room", "area", "table"] as const).map((ty) => (
                <option key={ty} value={ty}>
                  {t(`typeOne.${ty}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>{t("label")}</span>
            <input name="label" required maxLength={40} placeholder={t("labelPlaceholder")} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <AreaSelect areas={areaRows} locale={locale} noArea={t("noArea")} label={t("area")} />
            <label>
              <span className={label}>{t("capacity")}</span>
              <input name="capacity" type="number" min={1} max={500} className={input} />
            </label>
          </div>
          <Button type="submit" variant="outline">
            + {t("addSeatBtn")}
          </Button>
        </form>
      </Card>

      {/* Seats by type */}
      {seatRows.length === 0 && <Card className="text-center text-muted-foreground">{t("empty")}</Card>}
      {SEAT_TYPES.map((type) => {
        const list = seatRows.filter((s) => s.type === type);
        if (list.length === 0) return null;
        const printable = type === "table" || type === "room" || type === "area";
        return (
          <Card key={type} className="p-0" data-testid={`seats-${type}`}>
            <h2 className="border-b border-border p-3 text-lg font-bold">
              {t(`types.${type}`)} <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
            </h2>
            <ul className="divide-y divide-border">
              {list.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 p-3" data-testid="seat-row">
                  <span className="font-display flex h-11 min-w-11 items-center justify-center rounded-full bg-or px-2 font-extrabold text-encre">{s.label}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {areaName(s.areaId)}
                    {s.capacity ? ` · ${s.capacity} ${t("capacity").toLowerCase()}` : ""}
                    {seatCodes.get(s.id) && (
                      <span className="ml-2 rounded bg-muted px-1.5 font-mono text-xs font-bold tracking-wider" title={t("seatCode")} data-testid="seat-code">
                        {formatRc(seatCodes.get(s.id)!)}
                      </span>
                    )}
                    {!s.active && (
                      <Badge variant="muted" className="ml-2">
                        {t("inactive")}
                      </Badge>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    {perSeat && printable && (
                      <>
                        <StickerDownload
                          qrSrc={`/api/app/qr?seat=${s.id}`}
                          rc={seatCodes.get(s.id) ? formatRc(seatCodes.get(s.id)!) : formatRc(mainCode)}
                          name={r.name}
                          seat={`${t(`typeOne.${s.type}`)} ${s.label}`}
                          filename={`${r.slug}-${slugify(`${s.type}-${s.label}`)}`}
                          text={sticker}
                          label={t("download")}
                          className={btn + " flex items-center text-primary"}
                          testId="seat-sticker-download"
                        />
                        <a href={seatUrl(base, r.slug, s.qrToken)} target="_blank" rel="noopener" className={btn + " flex items-center"} aria-label={`${t("qr")} ${s.label}`}>
                          ↗
                        </a>
                        <form action={regenerateSeatAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton message={t("confirmRegenerate")} className="text-foreground">
                            {t("regenerate")}
                          </ConfirmButton>
                        </form>
                      </>
                    )}
                    <form action={moveSeatAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button name="dir" value="up" className={btn} aria-label={t("moveUp")} disabled={i === 0}>
                        ↑
                      </button>
                      <button name="dir" value="down" className={btn} aria-label={t("moveDown")} disabled={i === list.length - 1}>
                        ↓
                      </button>
                    </form>
                  </span>
                  <details className="w-full">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">{t("edit")}</summary>
                    <div className="flex flex-wrap items-end gap-2 pt-2">
                      <form action={updateSeatAction} className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
                        <input type="hidden" name="id" value={s.id} />
                        <input name="label" defaultValue={s.label} required maxLength={40} aria-label={t("label")} className={input} />
                        <AreaSelect areas={areaRows} locale={locale} noArea={t("noArea")} label={t("area")} defaultValue={s.areaId ?? ""} srOnly />
                        <input name="capacity" type="number" min={1} max={500} defaultValue={s.capacity ?? ""} aria-label={t("capacity")} className={input} />
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input type="checkbox" name="active" defaultChecked={s.active} className="h-5 w-5" />
                          {t("active")}
                        </label>
                        <Button type="submit">{t("save")}</Button>
                      </form>
                      {printable && (
                        <form action={deleteSeatAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton message={t("confirmDelete")}>{t("delete")}</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      {/* Open sessions */}
      <Card data-testid="open-sessions">
        <h2 className="mb-3 text-lg font-bold">{t("sessions")}</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-display flex h-11 min-w-11 items-center justify-center rounded-full bg-vert px-2 font-extrabold text-creme">{x.label}</span>
                <span className="flex-1 text-sm">
                  {t(`typeOne.${x.type}`)} · {t("phones", { count: x.phones })} · {t("since", { time: format.dateTime(x.openedAt, { timeStyle: "short" }) })} ·{" "}
                  {x.source === "qr" ? t("viaQr") : t("viaPicker")}
                </span>
                <form action={closeSessionAction}>
                  <input type="hidden" name="id" value={x.id} />
                  <button className={btn + " text-danger"}>{t("close")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          <Link href={`/r/${r.slug}`} target="_blank" className="underline">
            {menuUrl(base, r.slug)}
          </Link>
        </p>
      </Card>
    </div>
  );
}

function AreaSelect({
  areas,
  locale,
  noArea,
  label: text,
  defaultValue = "",
  srOnly = false,
}: {
  areas: Array<{ id: string; name: { fr: string } & Partial<Record<string, string>> }>;
  locale: string;
  noArea: string;
  label: string;
  defaultValue?: string;
  srOnly?: boolean;
}) {
  return (
    <label>
      <span className={srOnly ? "sr-only" : label}>{text}</span>
      <select name="areaId" defaultValue={defaultValue} className={input}>
        <option value="">{noArea}</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {pickText(a.name, locale)}
          </option>
        ))}
      </select>
    </label>
  );
}

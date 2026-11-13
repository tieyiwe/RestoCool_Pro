import "server-only";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import type { DB } from "@/db";
import { restaurants, type Reservation } from "@/db/schema";
import { formatBfPhone } from "@/lib/format";
import { log } from "@/lib/log";
import { checkinToken, currentWait, expiresAt, RESERVATION_DEFAULTS, reservationConfig, reservationToken } from "@/lib/reservations";
import { sendMail } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type ReservationMailKind = "requested" | "confirmed" | "declined" | "cancelled" | "cancelledByCustomer";

type Business = { name: string; slug: string; address: string | null; city: string; phone: string | null; expiryMinutes?: number; waitMinutes?: number | null };

/** The date in words in the customer's language (« samedi 14 novembre 2026 »). */
function longDate(day: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** One reservation email (HTML with inline styles that mail apps keep, plus plain text). */
export async function reservationEmail(kind: ReservationMailKind, r: Reservation, b: Business, baseUrl: string) {
  const locale = ["fr", "en", "zh"].includes(r.locale) ? r.locale : "fr";
  const t = await getTranslations({ locale, namespace: "email.reservation" });
  const link = `${baseUrl}/reservation/${reservationToken(r.id)}`;
  const menu = `${baseUrl}/r/${b.slug}`;
  const when = longDate(r.date, locale);
  const subject = t(`${kind}.subject`, { business: b.name, date: when, time: r.time });
  const rows: Array<[string, string]> = [
    [t("business"), b.name],
    [t("date"), when],
    [t("time"), r.time],
    [t("guests"), String(r.partySize)],
    [t("ref"), r.ref],
    ...(b.address || b.city ? ([[t("address"), [b.address, b.city].filter(Boolean).join(", ")]] as Array<[string, string]>) : []),
    ...(b.phone ? ([[t("phone"), formatBfPhone(b.phone)]] as Array<[string, string]>) : []),
  ];
  const body = t(`${kind}.body`, { business: b.name, phone: formatBfPhone(r.phone) });
  const reason = r.reason && (kind === "declined" || kind === "cancelled") ? t("reason", { reason: r.reason }) : null;
  const showLink = kind === "requested" || kind === "confirmed";
  // Confirmed: the check-in QR the guest shows on arrival (works once, until the expiry).
  const qr = kind === "confirmed" && r.checkinHash ? checkinToken(r.id) : null;
  const until = qr ? expiresAt(r, { expiryMinutes: b.expiryMinutes ?? RESERVATION_DEFAULTS.expiryMinutes }).toISOString().slice(11, 16) : null;
  const qrBlock = qr
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:2px solid #0f6b3e;border-radius:14px"><tr><td style="padding:16px;text-align:center">
      <div style="font-size:17px;font-weight:800;color:#0b3d26">${esc(t("qrTitle"))}</div>
      <img src="${baseUrl}/api/public/reservations/qr/${qr}.png" width="220" height="220" alt="${esc(t("qrAlt", { ref: r.ref }))}" style="display:block;margin:12px auto;width:220px;height:220px">
      <div style="font-size:14px;line-height:1.5;color:#17231c">${esc(t("qrText", { until: until! }))}</div>
      <div style="margin-top:6px;font-size:13px;color:#3e4a42">${esc(t("qrFallback", { ref: r.ref }))}</div></td></tr></table>`
    : "";
  const wait = kind === "confirmed" && b.waitMinutes ? t("waitNow", { n: b.waitMinutes }) : null;
  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff8ec;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4d9c2">
  <tr><td style="background:#0b3d26;padding:22px 24px;text-align:center">
    <div style="font-size:24px;font-weight:800;color:#fff8ec">Resto<span style="color:#e9b530">Cool</span></div>
    <div style="margin-top:4px;font-size:13px;color:#f1e6d0">${esc(t("header"))}</div>
  </td></tr>
  <tr><td style="height:5px;background-color:#e9b530"></td></tr>
  <tr><td style="padding:24px">
    <h1 style="margin:0 0 10px;font-size:22px;color:#0b3d26">${esc(t(`${kind}.title`))}</h1>
    <p style="margin:0 0 6px;font-size:16px;color:#17231c">${esc(t("hello", { name: r.name.split(/\s+/)[0] ?? r.name }))}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#17231c">${esc(body)}</p>
    ${reason ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#17231c;background:#f1e6d0;border-radius:10px;padding:10px 12px">${esc(reason)}</p>` : ""}
    ${qrBlock}
    ${wait ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#7a4a00;background:#fff1cc;border-radius:10px;padding:10px 12px">⏳ ${esc(wait)}</p>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4d9c2;border-radius:12px">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 12px;font-size:13px;color:#3e4a42;width:40%">${esc(k)}</td><td style="padding:8px 12px;font-size:15px;font-weight:700;color:#17231c">${esc(v)}</td></tr>`).join("")}
    </table>
    ${showLink ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 8px"><tr><td style="background:#0f6b3e;border-radius:12px"><a href="${link}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:800;color:#fff8ec;text-decoration:none">${esc(t("manage"))}</a></td></tr></table>` : ""}
    <p style="margin:14px 0 0;font-size:14px;color:#3e4a42;text-align:center"><a href="${menu}" style="color:#0f6b3e;font-weight:700">${esc(t("menu", { business: b.name }))}</a></p>
  </td></tr>
  <tr><td style="background:#0b3d26;padding:14px 24px;text-align:center;font-size:12px;line-height:1.5;color:#f1e6d0">${esc(t("footer", { business: b.name }))}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    t(`${kind}.title`),
    "",
    t("hello", { name: r.name.split(/\s+/)[0] ?? r.name }),
    body,
    reason ?? "",
    qr ? `\n${t("qrTitle")}\n${t("qrText", { until: until! })}\n${t("qrFallback", { ref: r.ref })}\n${baseUrl}/reservation/${reservationToken(r.id)}` : "",
    wait ?? "",
    "",
    ...rows.map(([k, v]) => `${k} : ${v}`),
    "",
    showLink ? `${t("manage")} : ${link}` : "",
    `${t("menu", { business: b.name })} : ${menu}`,
    "",
    t("footer", { business: b.name }),
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
  return { subject, html, text };
}

/** Sends one reservation email to the customer. Never throws (a mail problem must not block the booking). */
export async function sendReservationEmail(db: DB, kind: ReservationMailKind, r: Reservation, baseUrl: string) {
  try {
    const [b] = await db
      .select({ name: restaurants.name, slug: restaurants.slug, address: restaurants.address, city: restaurants.city, phones: restaurants.phones, whatsapp: restaurants.whatsapp, settings: restaurants.settings })
      .from(restaurants)
      .where(eq(restaurants.id, r.restaurantId));
    if (!b) return { status: "skipped" as const };
    const mail = await reservationEmail(kind, r, {
        name: b.name,
        slug: b.slug,
        address: b.address,
        city: b.city,
        phone: b.phones[0] ?? b.whatsapp ?? null,
        expiryMinutes: reservationConfig(b).expiryMinutes,
        waitMinutes: currentWait(b)?.minutes ?? null,
      }, baseUrl);
    const res = await sendMail({ to: r.email, ...mail });
    log.info("reservation_email", { restaurantId: r.restaurantId, kind, status: res.status });
    return res;
  } catch (err) {
    log.error("reservation_email_error", { err });
    return { status: "failed" as const };
  }
}

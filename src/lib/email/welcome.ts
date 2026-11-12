import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import type { DB } from "@/db";
import { accessCodes, emailLog, restaurants } from "@/db/schema";
import { getPlatformSettings } from "@/lib/platform/settings";
import { isLocale, type Locale } from "@/i18n/config";
import { log } from "@/lib/log";
import { sendMail } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type WelcomeInput = {
  locale: Locale;
  ownerName: string | null;
  business: string;
  kind: "restaurant" | "transport";
  slug: string;
  rcCode: string | null;
  baseUrl: string;
};

/** The welcome email (HTML with inline styles that mail apps keep, plus a plain-text version). */
export async function welcomeEmail(i: WelcomeInput) {
  const t = await getTranslations({ locale: i.locale, namespace: "email.welcome" });
  const FREE_LAUNCH = (await getPlatformSettings()).freeLaunch;
  const first = i.ownerName?.trim().split(/\s+/)[0] ?? "";
  const hello = first ? t("hello", { name: first }) : t("helloNoName");
  const features = (["f1", "f2", i.kind === "transport" ? "f3Transport" : "f3", "f4", "f5", "f6"] as const).map((k) => t(k));
  const steps = (["step1", i.kind === "transport" ? "step2Transport" : "step2", "step3"] as const).map((k) => t(k));
  const app = `${i.baseUrl}/app`;
  const menu = `${i.baseUrl}/r/${i.slug}`;
  const rc = i.rcCode ? `RC-${i.rcCode}` : null;
  const subject = t("subject", { business: i.business });

  const li = (s: string) => `<tr><td style="padding:6px 0;font-size:15px;line-height:1.5;color:#17231c">${esc(s)}</td></tr>`;
  const html = `<!doctype html>
<html lang="${i.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff8ec;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(t("preheader"))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4d9c2">
  <tr><td style="background:#0b3d26;padding:28px 28px 22px;text-align:center">
    <img src="${i.baseUrl}/brand/png/app-icon-192.png" width="64" height="64" alt="RestoCool" style="display:block;margin:0 auto 10px;border-radius:14px">
    <div style="font-size:26px;font-weight:800;color:#fff8ec">Resto<span style="color:#e9b530">Cool</span></div>
    <div style="margin-top:6px;font-size:13px;color:#f1e6d0">${esc(t("tagline"))}</div>
  </td></tr>
  <tr><td style="height:5px;background:linear-gradient(90deg,#b24a26 0 33%,#e9b530 33% 66%,#0f6b3e 66%);background-color:#e9b530"></td></tr>
  <tr><td style="padding:28px">
    <h1 style="margin:0 0 12px;font-size:24px;color:#0b3d26">${esc(hello)}</h1>
    <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#17231c">${esc(t("intro", { business: i.business }))}</p>
    ${rc ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#f1e6d0;border-radius:14px"><tr><td style="padding:16px 18px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#3e4a42">${esc(t("rcTitle"))}</div>
      <div style="font-size:28px;font-weight:800;font-family:'Courier New',monospace;color:#0f6b3e;margin:4px 0">${esc(rc)}</div>
      <div style="font-size:14px;line-height:1.5;color:#3e4a42">${esc(t("rcText"))}</div></td></tr></table>` : ""}
    ${FREE_LAUNCH ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:2px solid #0f6b3e;border-radius:14px"><tr><td style="padding:16px 18px">
      <div style="font-size:17px;font-weight:800;color:#0f6b3e">${esc(t("offerTitle"))}</div>
      <div style="font-size:15px;line-height:1.5;color:#17231c;margin-top:4px">${esc(t("offerText"))}</div></td></tr></table>` : ""}
    <h2 style="margin:24px 0 8px;font-size:18px;color:#0b3d26">${esc(t("stepsTitle"))}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map((s, n) => li(`${n + 1}. ${s}`)).join("")}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto"><tr><td style="background:#0f6b3e;border-radius:12px">
      <a href="${app}" style="display:inline-block;padding:15px 28px;font-size:16px;font-weight:800;color:#fff8ec;text-decoration:none">${esc(t("cta"))}</a>
    </td></tr></table>
    <h2 style="margin:24px 0 8px;font-size:18px;color:#0b3d26">${esc(t("featuresTitle"))}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${features.map(li).join("")}</table>
    <h2 style="margin:24px 0 8px;font-size:18px;color:#0b3d26">${esc(t("whyTitle"))}</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3e4a42">${esc(t("whyText"))}</p>
    <p style="margin:0 0 6px;font-size:14px;color:#3e4a42">${esc(t("menuLink"))} <a href="${menu}" style="color:#0f6b3e;font-weight:700">${esc(menu.replace(/^https?:\/\//, ""))}</a></p>
    <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#17231c">${esc(t("help"))}</p>
    <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#17231c">${esc(t("sign"))}<br><b>${esc(t("team"))}</b></p>
  </td></tr>
  <tr><td style="background:#0b3d26;padding:16px 28px;text-align:center">
    <div style="display:inline-block;background:#0f6b3e;color:#fff8ec;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800">★ ${esc(t("local"))}</div>
    <div style="margin-top:10px;font-size:12px;line-height:1.5;color:#f1e6d0">${esc(t("footer"))}</div>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    hello,
    "",
    t("intro", { business: i.business }),
    rc ? `\n${t("rcTitle")} : ${rc}\n${t("rcText")}` : "",
    FREE_LAUNCH ? `\n${t("offerTitle")}\n${t("offerText")}` : "",
    `\n${t("stepsTitle")}`,
    ...steps.map((s, n) => `${n + 1}. ${s}`),
    `\n${t("cta")} : ${app}`,
    `\n${t("featuresTitle")}`,
    ...features.map((f) => `- ${f}`),
    `\n${t("whyTitle")}\n${t("whyText")}`,
    `\n${t("menuLink")} ${menu}`,
    `\n${t("help")}`,
    `\n${t("sign")}\n${t("team")}`,
    `\n${t("local")}\n${t("footer")}`,
  ].join("\n");
  return { subject, html, text };
}

/**
 * Sends the welcome email once per business (email_log is the guard), never throws: a mail
 * problem must not stop the owner from setting up.
 */
export async function sendWelcomeEmail(db: DB, opts: { restaurantId: string; to: string; ownerName: string | null; locale: string; baseUrl: string }) {
  try {
    const [row] = await db
      .insert(emailLog)
      .values({ restaurantId: opts.restaurantId, kind: "welcome", to: opts.to })
      .onConflictDoNothing()
      .returning({ id: emailLog.id });
    if (!row) return { status: "skipped" as const, error: "already sent" };
    const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, opts.restaurantId) });
    if (!r) return { status: "skipped" as const };
    // The business's numéro RC: the code of the main QR (no seat).
    const [main] = await db
      .select({ code: accessCodes.code })
      .from(accessCodes)
      .where(and(eq(accessCodes.restaurantId, r.id), isNull(accessCodes.seatId)))
      .limit(1);
    const mail = await welcomeEmail({
      locale: isLocale(opts.locale) ? opts.locale : "fr",
      ownerName: opts.ownerName,
      business: r.name,
      kind: r.kind === "transport" ? "transport" : "restaurant",
      slug: r.slug,
      rcCode: main?.code ?? null,
      baseUrl: opts.baseUrl,
    });
    const res = await sendMail({ to: opts.to, ...mail });
    await db
      .update(emailLog)
      .set({ status: res.status, error: res.error ?? null, sentAt: res.status === "sent" ? new Date() : null })
      .where(eq(emailLog.id, row.id));
    log.info("welcome_email", { restaurantId: r.id, status: res.status });
    return res;
  } catch (err) {
    log.error("welcome_email_error", { err });
    return { status: "failed" as const, error: "error" };
  }
}

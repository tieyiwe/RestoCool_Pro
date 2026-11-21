import "server-only";
import { getTranslations } from "next-intl/server";
import { sendMail, type SendResult } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type OwnerInviteMail = {
  to: string;
  lang: "fr" | "en";
  business: { name: string; slug: string; logoUrl: string | null; rc: string | null; items: number };
  link: string;
  baseUrl: string;
  expiresAt: Date;
};

/**
 * Invitation to take over a business prepared by RestoCool. The chosen language first, the other
 * one below (owners in Burkina read French; some prefer English). One button: the invitation page.
 */
export async function ownerInviteEmail(m: OwnerInviteMail) {
  const order: Array<"fr" | "en"> = m.lang === "en" ? ["en", "fr"] : ["fr", "en"];
  const ts = await Promise.all(order.map((locale) => getTranslations({ locale, namespace: "ownerInvite" })));
  const page = `${m.baseUrl}/r/${m.business.slug}`;
  const logo = m.business.logoUrl ? (m.business.logoUrl.startsWith("http") ? m.business.logoUrl : `${m.baseUrl}${m.business.logoUrl}`) : `${m.baseUrl}/brand/png/app-icon-192.png`;
  const date = (locale: "fr" | "en") => new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Africa/Ouagadougou" }).format(m.expiresAt);

  const block = (t: (typeof ts)[number], lang: "fr" | "en") => {
    const name = m.business.name;
    const intro = m.business.items > 0 ? t("intro", { name, items: m.business.items }) : t("introNoItems", { name });
    return `<div lang="${lang}">
<h1 style="margin:0 0 12px;font-size:22px;color:#0b3d26">${esc(t("email.hello"))}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#17231c">${esc(intro)}</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#17231c">${esc(t("email.now", { email: m.to }))}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td>
<a href="${esc(m.link)}" style="display:inline-block;background:#0f6b3e;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 22px;border-radius:12px">${esc(t("email.cta", { name }))}</a>
</td></tr></table>
<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#3e4a42">${esc(t("email.get"))}</p>
<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.6;color:#17231c"><li>${esc(t("email.get1"))}</li><li>${esc(t("email.get2"))}</li><li>${esc(t("email.get3"))}</li></ul>
<p style="margin:0 0 4px;font-size:14px;color:#17231c">${esc(t("email.page"))} <a href="${esc(page)}" style="color:#0f6b3e">${esc(page.replace(/^https?:\/\//, ""))}</a></p>
${m.business.rc ? `<p style="margin:0 0 12px;font-size:14px;color:#17231c">${esc(t("email.rc"))} <b style="font-family:monospace;letter-spacing:1px">RC-${esc(m.business.rc)}</b></p>` : ""}
<p style="margin:12px 0 4px;font-size:12px;color:#3e4a42">${esc(t("email.linkText"))}<br><a href="${esc(m.link)}" style="color:#0f6b3e;word-break:break-all">${esc(m.link)}</a></p>
<p style="margin:12px 0 0;font-size:12px;color:#3e4a42">${esc(t("email.private", { date: date(lang) }))}</p>
</div>`;
  };

  const subject = ts[0]!("email.subject", { name: m.business.name });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff8ec;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4d9c2">
<tr><td style="background:#0b3d26;padding:24px;text-align:center">
<img src="${esc(logo)}" width="64" height="64" alt="" style="display:block;margin:0 auto 10px;border-radius:14px;background:#ffffff">
<div style="font-size:22px;font-weight:800;color:#fff8ec">${esc(m.business.name)}</div>
<div style="font-size:13px;color:#e9b530;margin-top:4px">Resto<b>Cool</b> · ${esc(ts[0]!("subtitle"))}</div>
</td></tr>
<tr><td style="padding:28px">${block(ts[0]!, order[0]!)}</td></tr>
<tr><td style="padding:0 28px"><hr style="border:none;border-top:1px solid #e4d9c2;margin:0"></td></tr>
<tr><td style="padding:28px">${block(ts[1]!, order[1]!)}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#6b6b6b;text-align:center">RestoCool · TIBLOGICS · restocool.com</td></tr>
</table></td></tr></table></body></html>`;

  const textBlock = (t: (typeof ts)[number], lang: "fr" | "en") =>
    [
      t("email.hello"),
      m.business.items > 0 ? t("intro", { name: m.business.name, items: m.business.items }) : t("introNoItems", { name: m.business.name }),
      t("email.now", { email: m.to }),
      `${t("email.cta", { name: m.business.name })} : ${m.link}`,
      `${t("email.get")}\n- ${t("email.get1")}\n- ${t("email.get2")}\n- ${t("email.get3")}`,
      `${t("email.page")} ${page}`,
      ...(m.business.rc ? [`${t("email.rc")} RC-${m.business.rc}`] : []),
      t("email.private", { date: date(lang) }),
    ].join("\n\n");
  const text = `${textBlock(ts[0]!, order[0]!)}\n\n— — —\n\n${textBlock(ts[1]!, order[1]!)}`;
  return { subject, html, text };
}

export async function sendOwnerInvite(m: OwnerInviteMail): Promise<SendResult> {
  return sendMail({ to: m.to, ...(await ownerInviteEmail(m)) });
}

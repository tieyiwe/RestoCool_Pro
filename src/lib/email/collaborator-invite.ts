import "server-only";
import { getTranslations } from "next-intl/server";
import type { AdminPerm, AdminRole } from "@/lib/admin/access";
import { sendMail, type SendResult } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type InviteInput = { to: string; name: string | null; role: AdminRole; perms: AdminPerm[]; invitedBy: string; baseUrl: string };

/** Links in the invitation: create an account, or sign in; both come back to the console. */
export function inviteLinks(baseUrl: string) {
  const back = encodeURIComponent(`${baseUrl}/admin_pro`);
  return { signUp: `${baseUrl}/sign-up?redirect_url=${back}`, signIn: `${baseUrl}/sign-in?redirect_url=${back}`, console: `${baseUrl}/admin_pro` };
}

/**
 * Invitation to the RestoCool console for a new collaborator: English first, French below
 * (the console's two languages), their role and what it opens, and the sign-up / sign-in links.
 */
export async function collaboratorInviteEmail(i: InviteInput) {
  const [en, fr] = await Promise.all([getTranslations({ locale: "en", namespace: "admin" }), getTranslations({ locale: "fr", namespace: "admin" })]);
  const links = inviteLinks(i.baseUrl);
  const first = i.name?.trim().split(/\s+/)[0] ?? "";
  const permKey = (p: string) => `team.perms.${p.replace(".", "_")}` as "team.perms.dashboard";
  const roleKey = `team.roles.${i.role}` as "team.roles.support";

  const block = (t: typeof en, lang: "en" | "fr") => {
    const perms = i.perms.map((p) => `<li style="margin:4px 0">${esc(t(permKey(p)))}</li>`).join("");
    return `<div lang="${lang}">
<h1 style="margin:0 0 12px;font-size:22px;color:#0b3d26">${esc(first ? t("invite.hello", { name: first }) : t("invite.helloNoName"))}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#17231c">${esc(t("invite.intro", { by: i.invitedBy }))}</p>
<p style="margin:0 0 6px;font-size:15px;color:#17231c"><b>${esc(t("invite.role"))}</b> ${esc(t(roleKey))}</p>
<p style="margin:12px 0 4px;font-size:14px;font-weight:bold;color:#3e4a42">${esc(t("invite.access"))}</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.5;color:#17231c">${perms}</ul>
<p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#17231c">${esc(t("invite.how", { email: i.to }))}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr>
<td style="padding:0 8px 8px 0"><a href="${esc(links.signUp)}" style="display:inline-block;background:#0f6b3e;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">${esc(t("invite.signUp"))}</a></td>
<td style="padding:0 0 8px 0"><a href="${esc(links.signIn)}" style="display:inline-block;border:2px solid #0f6b3e;color:#0f6b3e;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:10px">${esc(t("invite.signIn"))}</a></td>
</tr></table>
<p style="margin:0 0 4px;font-size:13px;color:#3e4a42">${esc(t("invite.then"))} <a href="${esc(links.console)}" style="color:#0f6b3e">${esc(links.console)}</a></p>
<p style="margin:12px 0 0;font-size:13px;color:#3e4a42">${esc(t("invite.private"))}</p>
</div>`;
  };

  const subject = `${en("invite.subject")} · ${fr("invite.subject")}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff8ec;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4d9c2">
<tr><td style="background:#0b3d26;padding:24px;text-align:center">
<img src="${esc(i.baseUrl)}/brand/png/app-icon-192.png" width="56" height="56" alt="RestoCool" style="display:block;margin:0 auto 8px;border-radius:12px">
<div style="font-size:24px;font-weight:800;color:#fff8ec">Resto<span style="color:#e9b530">Cool</span> <span style="font-size:13px;background:#e9b530;color:#17231c;border-radius:99px;padding:2px 8px;vertical-align:middle">Console</span></div>
</td></tr>
<tr><td style="padding:28px">${block(en, "en")}</td></tr>
<tr><td style="padding:0 28px"><hr style="border:none;border-top:1px solid #e4d9c2;margin:0"></td></tr>
<tr><td style="padding:28px">${block(fr, "fr")}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#6b6b6b;text-align:center">RestoCool · TIBLOGICS</td></tr>
</table></td></tr></table></body></html>`;

  const textBlock = (t: typeof en) =>
    [
      first ? t("invite.hello", { name: first }) : t("invite.helloNoName"),
      t("invite.intro", { by: i.invitedBy }),
      `${t("invite.role")} ${t(roleKey)}`,
      `${t("invite.access")} ${i.perms.map((p) => t(permKey(p))).join(", ")}`,
      t("invite.how", { email: i.to }),
      `${t("invite.signUp")}: ${links.signUp}`,
      `${t("invite.signIn")}: ${links.signIn}`,
      `${t("invite.then")} ${links.console}`,
    ].join("\n\n");
  const text = `${textBlock(en)}\n\n— — —\n\n${textBlock(fr)}`;
  return { subject, html, text };
}

export async function sendCollaboratorInvite(i: InviteInput): Promise<SendResult> {
  const mail = await collaboratorInviteEmail(i);
  return sendMail({ to: i.to, ...mail });
}

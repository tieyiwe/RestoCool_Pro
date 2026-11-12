import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { log } from "@/lib/log";

/**
 * Outgoing email through the RestoCool mailbox (Titan, info@restocool.com) over SMTP. Settings
 * come from Replit Secrets: SMTP_PASS (required to send), and optionally SMTP_HOST
 * (smtp.titan.email), SMTP_PORT (465), SMTP_USER (info@restocool.com), MAIL_FROM.
 * Without SMTP_PASS nothing is sent: in development the email is written to .data/outbox to preview.
 */
export type Mail = { to: string; subject: string; html: string; text: string };
export type SendResult = { status: "sent" | "skipped" | "failed"; error?: string };

export function mailConfig() {
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER?.trim() || "info@restocool.com";
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.titan.email",
    port,
    secure: port === 465,
    user,
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM?.trim() || `RestoCool <${user}>`,
  };
}

let transport: Transporter | null = null;
function getTransport() {
  const c = mailConfig();
  transport ??= nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transport;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const c = mailConfig();
  if (!c.pass) {
    if (process.env.NODE_ENV !== "production") {
      try {
        const dir = path.join(process.cwd(), ".data", "outbox");
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `${Date.now()}-${mail.to.replace(/[^\w.@-]/g, "_")}.html`), mail.html);
      } catch {}
    }
    log.warn("email_not_configured", { subject: mail.subject });
    return { status: "skipped", error: "SMTP_PASS missing" };
  }
  try {
    await getTransport().sendMail({ from: c.from, replyTo: c.user, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    return { status: "sent" };
  } catch (err) {
    // Never log the content or the credentials, only the reason.
    const error = err instanceof Error ? err.message.slice(0, 300) : "unknown";
    log.error("email_failed", { error });
    return { status: "failed", error };
  }
}

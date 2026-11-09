import "server-only";
import { headers } from "next/headers";

/**
 * Public base URL for links printed in QR codes. APP_URL wins (production: https://restocool.com);
 * otherwise the host the request came in on (Replit preview, localhost).
 */
export async function publicBaseUrl(): Promise<string> {
  const fromEnv = process.env.APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:5000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const seatUrl = (base: string, slug: string, token: string) => `${base}/r/${slug}/t/${token}`;
export const menuUrl = (base: string, slug: string) => `${base}/r/${slug}`;

import "server-only";
import type { Metadata } from "next";
import { publicBaseUrl } from "@/lib/urls";

/** Absolute site origin for canonical URLs, sitemaps and JSON-LD (APP_URL, else the request host). */
export const siteBase = publicBaseUrl;

/** Pages that must never appear in search results (private app, tokens, sign-in). */
export const NOINDEX: Metadata["robots"] = { index: false, follow: false, googleBot: { index: false, follow: false } };

/** Open Graph defaults repeated on pages that set their own openGraph (Next replaces it, it does not merge). */
export const OG_BASE = { siteName: "RestoCool", locale: "fr_FR", alternateLocale: ["en_US", "zh_CN"], type: "website" as const };

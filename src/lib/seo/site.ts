import "server-only";
import type { Metadata } from "next";
import { publicBaseUrl } from "@/lib/urls";

/** Absolute site origin for canonical URLs, sitemaps and JSON-LD (APP_URL, else the request host). */
export const siteBase = publicBaseUrl;

/** Pages that must never appear in search results (private app, tokens, sign-in). */
export const NOINDEX: Metadata["robots"] = { index: false, follow: false, googleBot: { index: false, follow: false } };

/** Open Graph defaults repeated on pages that set their own openGraph (Next replaces it, it does not merge). */
export const OG_BASE = {
  siteName: "RestoCool",
  locale: "fr_FR",
  alternateLocale: ["en_US", "zh_CN"],
  type: "website" as const,
  // The RestoCool share card (src/app/opengraph-image.tsx). A page with its own image file (a
  // business) must use OG_BASE_OWN_IMAGE: an `images` here would replace its file image.
  images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "RestoCool", type: "image/png" }],
};

/** OG_BASE without the RestoCool image, for pages that have their own opengraph-image file. */
export const OG_BASE_OWN_IMAGE = { siteName: OG_BASE.siteName, locale: OG_BASE.locale, alternateLocale: OG_BASE.alternateLocale, type: OG_BASE.type };

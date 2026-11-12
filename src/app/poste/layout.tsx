import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX };

/** The PIN pad is a client component: give it the translations (no account on this page). */
export default function PosteLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

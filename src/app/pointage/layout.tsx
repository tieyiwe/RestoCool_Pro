import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX };

/** The kiosk form is a client component: give it the translations (no Clerk on these pages). */
export default function PointageLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX };

/** Join pages are public (no Clerk): the form is a client component that needs the translations. */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

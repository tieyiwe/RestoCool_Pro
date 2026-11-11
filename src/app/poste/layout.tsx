import { NextIntlClientProvider } from "next-intl";

/** The PIN pad is a client component: give it the translations (no account on this page). */
export default function PosteLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

import { NextIntlClientProvider } from "next-intl";

/** The kiosk form is a client component: give it the translations (no Clerk on these pages). */
export default function PointageLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

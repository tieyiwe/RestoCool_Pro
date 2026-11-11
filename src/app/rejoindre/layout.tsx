import { NextIntlClientProvider } from "next-intl";

/** Join pages are public (no Clerk): the form is a client component that needs the translations. */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

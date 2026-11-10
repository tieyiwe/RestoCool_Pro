import { NextIntlClientProvider } from "next-intl";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}

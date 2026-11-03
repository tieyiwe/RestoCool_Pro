import type { Metadata, Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Baloo_2, Manrope } from "next/font/google";
import { BRAND } from "@/config/brand";
import "./globals.css";

// Self-hosted at build time by next/font: no request to Google from customers' phones.
const baloo = Baloo_2({ weight: ["600", "800"], subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-baloo" });
const manrope = Manrope({ weight: ["500", "700"], subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-manrope" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  return {
    title: { default: "RestoCool", template: "%s · RestoCool" },
    description: t("tagline"),
    applicationName: "RestoCool",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND.vert,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${baloo.variable} ${manrope.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

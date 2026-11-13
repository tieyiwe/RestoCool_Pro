import { Beat } from "@/components/usage/beat";
import { UpdateWatcher } from "@/components/update-watcher";
import { buildVersion } from "@/lib/version";
import type { Metadata, Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BRAND } from "@/config/brand";
import { OG_BASE, siteBase } from "@/lib/seo/site";
import "./globals.css";


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  // Absolute canonical / Open Graph URLs (APP_URL in production, else the request host).
  const base = await siteBase().catch(() => "http://localhost:5000");
  return {
    metadataBase: new URL(base),
    title: { default: "RestoCool", template: "%s · RestoCool" },
    description: t("tagline"),
    applicationName: "RestoCool",
    publisher: "TIBLOGICS",
    openGraph: { ...OG_BASE, title: "RestoCool", description: t("tagline") },
    twitter: { card: "summary_large_image" },
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
  const tu = await getTranslations("update");
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        {children}
        <Beat />
        {/* A new version published: phones and customers reload at a safe moment, owners on a computer get a pop-up. */}
        <UpdateWatcher version={buildVersion()} text={{ title: tu("title"), body: tu("body"), update: tu("update"), later: tu("later") }} />
      </body>
    </html>
  );
}

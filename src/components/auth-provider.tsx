import { ClerkProvider } from "@clerk/nextjs";
import { enUS, frFR, zhCN } from "@clerk/localizations";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { BRAND } from "@/config/brand";
import { env } from "@/lib/env";

const CLERK_LOCALES = { fr: frFR, en: enUS, zh: zhCN } as const;

/**
 * Wraps the signed-in areas (/app, /admin, sign-in). The public menu does not use it,
 * so customers never download Clerk's JavaScript. Sign-in screens follow the app language
 * (French by default) and RestoCool's colours. The name and logo shown on them come from the
 * Clerk application settings (Replit's Clerk settings when Clerk is managed by Replit).
 */
export async function AuthProvider({ children }: { children: React.ReactNode }) {
  const inner = <NextIntlClientProvider>{children}</NextIntlClientProvider>;
  if (!env.clerkConfigured()) return inner;
  const locale = (await getLocale()) as keyof typeof CLERK_LOCALES;
  return (
    <ClerkProvider
      publishableKey={env.clerkPublishableKey()}
      {...(env.clerkProxyPath() ? { proxyUrl: env.clerkProxyPath() } : {})}
      localization={CLERK_LOCALES[locale] ?? frFR}
      appearance={{
        variables: {
          colorPrimary: BRAND.vert,
          colorBackground: "#FFFFFF",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-manrope), system-ui, sans-serif",
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
    >
      {inner}
    </ClerkProvider>
  );
}

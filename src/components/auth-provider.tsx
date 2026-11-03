import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { env } from "@/lib/env";

/**
 * Wraps the signed-in areas (/app, /admin, sign-in). The public menu does not use it,
 * so customers never download Clerk's JavaScript.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const inner = <NextIntlClientProvider>{children}</NextIntlClientProvider>;
  if (!env.clerkConfigured()) return inner;
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/app" signUpFallbackRedirectUrl="/app">
      {inner}
    </ClerkProvider>
  );
}

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const PROTECTED = [/^\/app(\/|$)/, /^\/admin(\/|$)/, /^\/api\/app(\/|$)/, /^\/api\/admin(\/|$)/];
const isProtected = (req: NextRequest) => PROTECTED.some((re) => re.test(req.nextUrl.pathname));

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || "";
const proxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL || process.env.CLERK_PROXY_URL || "";
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY && publishableKey);
const devBypass = process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";

/**
 * Proxy mode (Replit-managed Clerk sets a proxy URL): the browser loads Clerk from
 * <this site>/__clerk/…, and this middleware forwards those requests to Clerk's Frontend API.
 * The proxy runs on whatever domain the visitor uses (restocool.com or the replit.app URL).
 */
const CLERK_PROXY_PATH = proxyUrl ? (new URL(proxyUrl, "https://x.invalid").pathname.replace(/\/$/, "") || "/__clerk") : "/__clerk";

const withClerk = clerkConfigured
  ? clerkMiddleware(
      async (auth, req) => {
        if (isProtected(req)) await auth.protect();
      },
      {
        publishableKey,
        signInUrl: "/sign-in",
        signUpUrl: "/sign-up",
        ...(proxyUrl ? { frontendApiProxy: { enabled: true, path: CLERK_PROXY_PATH } } : {}),
      },
    )
  : null;

/**
 * Sign-in gate for the owner app and admin. Clerk only proves identity; which restaurant a
 * user may act in, and what they may do there, is checked in every handler (members + can()).
 * It also runs (server-side only, no client JS) on the public menu so owners can preview drafts.
 */
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (withClerk) return withClerk(req, event);
  const localhost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(req.nextUrl.hostname);
  if (isProtected(req) && !(devBypass && localhost)) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip static files; always run for API routes.
  // The Clerk proxy path serves .js files, so it is listed on its own.
  matcher: ["/((?!_next|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|woff2?|webmanifest)$).*)", "/(api|trpc)(.*)", "/__clerk/(.*)"],
};

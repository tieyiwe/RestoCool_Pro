import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isProtected = createRouteMatcher(["/app(.*)", "/admin(.*)", "/api/app(.*)", "/api/admin(.*)"]);

const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const devBypass = process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

/**
 * Auth gate for the staff/owner app and admin. It also runs (server-side only, no client JS)
 * on the public menu so owners can preview an unpublished menu.
 * Fine-grained permissions (can()) are still checked in every handler.
 */
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (clerkConfigured) return withClerk(req, event);
  if (isProtected(req) && !devBypass) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip static files; always run for API routes.
  matcher: ["/((?!_next|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js|woff2?|webmanifest)$).*)", "/(api|trpc)(.*)"],
};

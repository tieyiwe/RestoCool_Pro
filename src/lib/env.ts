/** localhost, 127.0.0.1 or [::1], with or without a port. */
export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

/** Server-only environment access with clear messages. */
export const env = {
  /** Accepts the Next.js name and the plain name Replit-managed Clerk may provide. */
  clerkPublishableKey(): string {
    return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || "";
  },
  /** Set when Clerk is reached through a proxy (some managed setups). Empty otherwise. */
  clerkProxyUrl(): string {
    return process.env.NEXT_PUBLIC_CLERK_PROXY_URL || process.env.CLERK_PROXY_URL || "";
  },
  /**
   * Public diagnostics for a sign-in page that cannot load Clerk: the key type and the Clerk
   * server ("frontend API") the publishable key points to. Both are public (they are in the page).
   */
  clerkDiagnostics(): { mode: "test" | "live" | "unknown"; host: string } {
    const pk = env.clerkPublishableKey();
    const m = /^pk_(test|live)_(.+)$/.exec(pk);
    if (!m) return { mode: "unknown", host: "" };
    let host = "";
    try {
      host = Buffer.from(m[2]!, "base64").toString("utf8").replace(/\$$/, "");
    } catch {
      host = "";
    }
    return { mode: m[1] as "test" | "live", host: /^[a-z0-9.-]+$/i.test(host) ? host : "" };
  },
  /**
   * Path of the Clerk proxy on this site ("/__clerk"), when a proxy URL is configured. The browser
   * uses it relative to the page, so it works on restocool.com and on the replit.app address.
   */
  clerkProxyPath(): string {
    const url = env.clerkProxyUrl();
    if (!url) return "";
    return new URL(url, "https://x.invalid").pathname.replace(/\/$/, "") || "/__clerk";
  },
  clerkConfigured(): boolean {
    return Boolean(process.env.CLERK_SECRET_KEY && env.clerkPublishableKey());
  },
  /**
   * Local development without Clerk keys: act as the owner of DEV_RESTAURANT_SLUG.
   * Never active in production, even if the variable is set.
   */
  devAuthBypass(host?: string | null): boolean {
    if (process.env.NODE_ENV === "production" || process.env.DEV_AUTH_BYPASS !== "1") return false;
    // Only on this machine: a public dev URL (e.g. a Replit preview) must never get owner access.
    return host === undefined || isLocalHost(host);
  },
  devRestaurantSlug(): string {
    return process.env.DEV_RESTAURANT_SLUG ?? "restaurant-demo";
  },
  superadminEmails(): Set<string> {
    return new Set(
      (process.env.SUPERADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  },
  appUrl(): string {
    return (process.env.APP_URL ?? "http://localhost:5000").replace(/\/$/, "");
  },
};

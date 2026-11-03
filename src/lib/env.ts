/** Server-only environment access with clear messages. */
export const env = {
  clerkConfigured(): boolean {
    return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  },
  /**
   * Local development without Clerk keys: act as the owner of DEV_RESTAURANT_SLUG.
   * Never active in production, even if the variable is set.
   */
  devAuthBypass(): boolean {
    return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
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

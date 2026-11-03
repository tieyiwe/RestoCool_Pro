import { UserButton } from "@clerk/nextjs";
import { env } from "@/lib/env";

/** Clerk account button. Hidden in dev-bypass mode. */
export function UserMenu() {
  if (!env.clerkConfigured()) return null;
  return <UserButton />;
}

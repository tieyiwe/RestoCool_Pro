import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { env } from "@/lib/env";

/** Clerk's org (restaurant) switcher + account button. Hidden in dev-bypass mode. */
export function UserMenu() {
  if (!env.clerkConfigured()) return null;
  return (
    <div className="flex items-center gap-2">
      <OrganizationSwitcher hidePersonal afterCreateOrganizationUrl="/app" afterSelectOrganizationUrl="/app" />
      <UserButton />
    </div>
  );
}

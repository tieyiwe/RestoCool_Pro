"use client";

import { useClerk } from "@clerk/nextjs";

/**
 * Leaves the owner's/manager's account on this device and opens the PIN pad: the tablet then
 * belongs to the team, each person with their own PIN.
 */
export function SwitchToPost({ label }: { label: string }) {
  return <ClerkSwitch label={label} />;
}

function ClerkSwitch({ label }: { label: string }) {
  let clerk: ReturnType<typeof useClerk> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- outside a ClerkProvider (dev without Clerk) there is nobody to sign out
    clerk = useClerk();
  } catch {
    clerk = null;
  }
  return (
    <button
      type="button"
      onClick={() => (clerk?.loaded && clerk.user ? void clerk.signOut({ redirectUrl: "/poste" }) : location.assign("/poste"))}
      className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground"
      data-testid="switch-to-post"
    >
      {label}
    </button>
  );
}

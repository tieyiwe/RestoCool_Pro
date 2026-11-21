"use client";

import { useClerk } from "@clerk/nextjs";

/** Signs out, then comes back to this invitation so the right account can sign in. */
export function SwitchAccount({ label, back }: { label: string; back: string }) {
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
      onClick={() => (clerk?.loaded && clerk.user ? void clerk.signOut({ redirectUrl: back }) : location.assign(`/sign-in?redirect_url=${encodeURIComponent(back)}`))}
      className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground"
      data-testid="owner-invite-switch"
    >
      {label}
    </button>
  );
}

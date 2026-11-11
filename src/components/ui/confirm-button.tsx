"use client";

import { cn } from "@/lib/utils";

/** Submit button that asks for confirmation first (works inside a server-action form). */
export function ConfirmButton({ message, className, children, ...rest }: { message: string; className?: string; children: React.ReactNode; "data-testid"?: string }) {
  return (
    <button
      {...rest}
      type="submit"
      className={cn("min-h-11 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-muted", className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

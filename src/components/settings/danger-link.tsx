"use client";

import Link from "next/link";

/** First safety step: a confirmation before even opening the danger zone. */
export function DangerLink({ label, confirm }: { label: string; confirm: string }) {
  return (
    <Link
      href="/app/settings/danger"
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex min-h-11 items-center rounded-xl border-2 border-red-700 px-4 font-bold text-red-800 hover:bg-red-50 dark:text-red-200"
      data-testid="danger-link"
    >
      {label}
    </Link>
  );
}

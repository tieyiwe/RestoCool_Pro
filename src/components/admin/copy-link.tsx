"use client";

import { useState } from "react";

/** A read-only link with a « Copy » button (console: owner invitation link). */
export function CopyLink({ value, label, done, testId }: { value: string; label: string; done: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 font-mono text-xs" data-testid={testId} aria-label={label} />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="min-h-11 rounded-lg border border-border bg-surface px-4 font-bold"
      >
        {copied ? `✓ ${done}` : label}
      </button>
    </div>
  );
}

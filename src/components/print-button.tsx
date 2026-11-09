"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
      🖨️ {label}
    </button>
  );
}

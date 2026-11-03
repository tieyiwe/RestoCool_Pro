import { cn } from "@/lib/utils";

/** « 100 % local » badge: green pill with a thin red/yellow accent stripe. */
export function LocalBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-rc-green px-3 py-1 text-xs font-bold text-white", className)}>
      <span aria-hidden className="flex h-3 w-1.5 flex-col overflow-hidden rounded-sm">
        <span className="flex-1 bg-rc-red" />
        <span className="flex-1 bg-rc-yellow" />
      </span>
      {label}
    </span>
  );
}

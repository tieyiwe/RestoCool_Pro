import { cn } from "@/lib/utils";

/** « 100 % local » badge (brand kit): green pill, gold star. Only for confirmed claims. */
export function LocalBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-vert px-3 py-1 text-xs font-bold text-creme", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-or">
        <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.3L12 17.8 5.7 21.5l1.7-7.3L2 9.5l7.1-.6z" />
      </svg>
      {label}
    </span>
  );
}

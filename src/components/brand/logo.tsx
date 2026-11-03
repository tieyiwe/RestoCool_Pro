import { cn } from "@/lib/utils";

/** App icon: a covered dish with two wisps of steam. Legible at 32px. No state symbols. */
export function LogoMark({ className, title = "RestoCool" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} role="img" aria-label={title}>
      <rect width="32" height="32" rx="8" fill="#0E7C4A" />
      <path d="M11 8.5c-1.2 1.3 1.2 2.2 0 3.6M16 7c-1.2 1.4 1.2 2.4 0 3.9M21 8.5c-1.2 1.3 1.2 2.2 0 3.6" stroke="#F2B705" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M7 21a9 9 0 0 1 18 0z" fill="#fff" />
      <circle cx="16" cy="13.2" r="1.4" fill="#fff" />
      <rect x="5" y="21.5" width="22" height="2.6" rx="1.3" fill="#fff" />
    </svg>
  );
}

/** Two-part wordmark: "Resto" + "Cool". */
export function Logo({ className, showMark = true }: { className?: string; showMark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      {showMark && <LogoMark />}
      <span className="text-xl leading-none">
        <span className="text-foreground">Resto</span>
        <span className="text-rc-green">Cool</span>
      </span>
    </span>
  );
}

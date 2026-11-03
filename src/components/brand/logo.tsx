import { cn } from "@/lib/utils";

/**
 * RestoCool app icon from the brand kit (docs/brand/BRAND.md). Never redraw it.
 * TODO(brand kit): switch to /brand/svg/restocool-icon.svg (and restocool-favicon.svg
 * below 32px) once the SVG files are added to public/brand/svg/.
 */
export function LogoMark({ className, title = "RestoCool" }: { className?: string; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static brand asset, no optimisation needed
    <img
      src="/brand/png/app-icon-192.png"
      alt={title}
      width={32}
      height={32}
      className={cn("h-8 w-8 rounded-[22%]", className)}
      decoding="async"
    />
  );
}

/**
 * Horizontal logo: icon + wordmark.
 * TODO(brand kit): replace with /brand/svg/restocool-logo-horizontal.svg (wordmark outlined)
 * and -dark.svg on dark backgrounds. Until then the wordmark is set in Baloo 2, the logo font.
 */
export function Logo({ className, showMark = true, onDark = false }: { className?: string; showMark?: boolean; onDark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showMark && <LogoMark title="" />}
      <span className="font-display text-xl leading-none font-extrabold" aria-label="RestoCool">
        <span className={onDark ? "text-creme" : "text-encre"}>Resto</span>
        <span className={onDark ? "text-or" : "text-vert"}>Cool</span>
      </span>
    </span>
  );
}

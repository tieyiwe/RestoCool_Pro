import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthProvider } from "@/components/auth-provider";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { RestaurantSwitcher } from "@/components/restaurant-switcher";
import { UserMenu } from "@/components/user-menu";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  const nav = [
    { href: "/app", label: t("dashboard") },
    { href: "/app/menu", label: t("menu") },
    { href: "/app/seating", label: t("seating") },
    { href: "/app/staff", label: t("staff") },
    { href: "/app/settings", label: t("settings") },
  ];
  return (
    <AuthProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 flex print:hidden items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2">
          <Link href="/app" aria-label="RestoCool">
            <Logo />
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <RestaurantSwitcher />
            <LocaleSwitcher />
            <UserMenu />
          </div>
        </header>
        {!env.clerkConfigured() && env.devAuthBypass() && (
          <p role="status" className="bg-amber-100 print:hidden px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
            {t("devBypass")}
          </p>
        )}
        <div className="flex flex-1 flex-col md:flex-row">
          <nav aria-label={t("title")} className="flex print:hidden gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1 md:w-56 md:flex-col md:border-r md:border-b-0 md:py-4">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">
                {n.label}
              </Link>
            ))}
          </nav>
          <main className="flex-1 px-4 py-6 md:px-8 print:p-0">{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}

import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export const SETUP_STEPS = ["create", "profile", "contacts", "hours", "service", "appearance"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number] | "done";

/**
 * Focused setup: a guide with named steps on the left (top on phones), the form on the right.
 * Menu, tables, service, personnel… unlock once the business is created and set up.
 */
export async function SetupShell({ current, children }: { current: SetupStep; children: React.ReactNode }) {
  const t = await getTranslations("setup");
  const at = current === "done" ? SETUP_STEPS.length : SETUP_STEPS.indexOf(current);
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]" data-testid="setup-shell">
      {/* Phone: compact progress */}
      <div className="lg:hidden">
        <ol className="grid grid-cols-6 gap-1" aria-label={current === "done" ? t("allDone") : t("stepOf", { n: at + 1, total: SETUP_STEPS.length })}>
          {SETUP_STEPS.map((s, i) => (
            <li key={s} className={cn("h-1.5 rounded-full", i < at ? "bg-primary" : i === at ? "bg-[#E9B530]" : "bg-muted")} title={t(`steps.${s}.title`)} />
          ))}
        </ol>
      </div>

      {/* Desktop / tablet: the guide */}
      <aside className="relative hidden overflow-hidden rounded-3xl bg-[var(--rc-nuit)] p-6 text-[var(--rc-creme)] lg:block lg:self-start" aria-label={t("guide")}>
        <div className="rc-weave pointer-events-none absolute inset-0 opacity-10" aria-hidden />
        <p className="relative text-xs font-bold tracking-widest text-[#E9B530] uppercase">{t("eyebrow")}</p>
        <p className="font-display relative mt-1 text-xl leading-tight font-extrabold">{t("guideTitle")}</p>
        <ol className="relative mt-6 flex flex-col gap-1">
          {SETUP_STEPS.map((s, i) => {
            const state = i < at ? "done" : i === at ? "current" : "todo";
            return (
              <li key={s} className={cn("flex items-start gap-3 rounded-xl px-2 py-2", state === "current" && "bg-white/10")} aria-current={state === "current" ? "step" : undefined}>
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    state === "done" ? "bg-[#E9B530] text-[var(--rc-nuit)]" : state === "current" ? "bg-[var(--rc-creme)] text-[var(--rc-nuit)]" : "border border-white/30 text-white/60",
                  )}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <span>
                  <span className={cn("block font-semibold", state === "todo" && "text-white/60")}>{t(`steps.${s}.title`)}</span>
                  {state === "current" && <span className="block text-xs text-white/75">{t(`steps.${s}.hint`)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="relative mt-6 border-t border-white/15 pt-4">
          <p className="text-xs font-semibold text-white/70">{t("unlocks")}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(["menu", "seating", "service", "kitchen", "staff", "analytics"] as const).map((k) => (
              <li key={k} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">
                🔒 {t(`locked.${k}`)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-white/60">{t("time")}</p>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

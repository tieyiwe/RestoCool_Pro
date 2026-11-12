import { FREE_LAUNCH } from "@/config/plans";

/**
 * Platform switches read synchronously (plan checks run everywhere). The value is loaded from the
 * database by getPlatformSettings() (src/lib/platform/settings.ts) and kept here; before the
 * first load, or if the database is unreachable, the code default applies.
 */
const flags = { freeLaunch: FREE_LAUNCH };

export function freeLaunchActive(): boolean {
  return flags.freeLaunch;
}
export function setFlags(next: Partial<typeof flags>) {
  Object.assign(flags, next);
}

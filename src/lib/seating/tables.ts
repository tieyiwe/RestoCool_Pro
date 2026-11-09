/** "13, 17 20" → [13, 17, 20]. Ignores anything that is not a whole number. */
export function parseSkip(input: string): number[] {
  return (input.match(/\d+/g) ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

/** Table numbers from..to (inclusive), without the skipped ones. At most 200 at once. */
export function tableNumbers(from: number, to: number, skip: number[] = []): number[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return [];
  const skipped = new Set(skip);
  const out: number[] = [];
  for (let n = from; n <= to && out.length < 200; n++) if (!skipped.has(n)) out.push(n);
  return out;
}

export type InactivityTimings = { warnAfterSec: number; releaseAfterSec: number };
export const DEFAULT_INACTIVITY: InactivityTimings = { warnAfterSec: 240, releaseAfterSec: 30 };

export type InactivityState = { phase: "active" } | { phase: "warning"; secondsLeft: number } | { phase: "release" };

/**
 * Inactivity release (picker mode, before any order): after `warnAfterSec` without activity,
 * warn; after `releaseAfterSec` more, release. Pure function so it also works after the
 * screen was off: callers re-evaluate with the real clock when the page becomes visible.
 */
export function inactivityState(lastActivityMs: number, nowMs: number, t: InactivityTimings): InactivityState {
  const idle = (nowMs - lastActivityMs) / 1000;
  if (idle < t.warnAfterSec) return { phase: "active" };
  const left = t.warnAfterSec + t.releaseAfterSec - idle;
  return left > 0 ? { phase: "warning", secondsLeft: Math.ceil(left) } : { phase: "release" };
}

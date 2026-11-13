"use client";

import { reportNetwork } from "@/components/offline/offline-banner";

/**
 * Staff actions done without network (confirm, prepare, served, table freed, sold out…) wait on
 * the device and are sent in order when the network is back. Only order-level service actions
 * are queued: payments, settings and personnel are never done offline.
 * An action someone else already did meanwhile (the server answers 409 / 404 / 403) is dropped
 * and reported; the screen then shows the real state.
 */
const KEY = "rc-staff-outbox";
const QUEUEABLE = [/^\/api\/app\/orders\/[^/]+\/status$/, /^\/api\/app\/orders\/[^/]+\/items\/[^/]+$/, /^\/api\/app\/sessions\/[^/]+\/release$/, /^\/api\/app\/sold-out$/];

export type StaffAction = { id: string; url: string; body: unknown; at: number };

function read(): StaffAction[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as StaffAction[]) : [];
  } catch {
    return [];
  }
}
function write(list: StaffAction[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage refused: nothing kept */
  }
  window.dispatchEvent(new CustomEvent("rc:outbox", { detail: list.length }));
}

export const pendingActions = (): StaffAction[] => (typeof window === "undefined" ? [] : read());

/** Order status changes still waiting to be sent: the board shows them right away. */
export function pendingMoves(): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of pendingActions()) {
    const id = a.url.match(/^\/api\/app\/orders\/([^/]+)\/status$/)?.[1];
    const to = (a.body as { to?: string } | null)?.to;
    if (id && to) m.set(id, to);
  }
  return m;
}

export type PostResult = { ok: boolean; error?: string; queued?: boolean };

/** POST for staff screens: sends now, or keeps the action when the network is down. */
export async function staffPost(url: string, body: unknown): Promise<PostResult> {
  const queueable = QUEUEABLE.some((re) => re.test(url));
  if (queueable && typeof navigator !== "undefined" && !navigator.onLine) return enqueue(url, body);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) {
    reportNetwork(false);
    return queueable ? enqueue(url, body) : { ok: false, error: "network" };
  }
  reportNetwork(true);
  if (res.ok) return { ok: true };
  const b = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: b.error ?? "error" };
}

function enqueue(url: string, body: unknown): PostResult {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // A newer move of the same order replaces the older one (only the last status matters).
  const list = read().filter((a) => !(a.url === url && url.endsWith("/status")));
  write([...list, { id, url, body, at: Date.now() }]);
  return { ok: true, queued: true };
}

let flushing = false;
/** Send what waits, oldest first. Stops at the first network failure (tries again later). */
export async function flushStaffOutbox(): Promise<{ sent: number; skipped: number }> {
  if (flushing) return { sent: 0, skipped: 0 };
  flushing = true;
  let sent = 0;
  let skipped = 0;
  try {
    for (const a of read()) {
      const res = await fetch(a.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a.body) }).catch(() => null);
      if (!res) {
        reportNetwork(false);
        break;
      }
      reportNetwork(true);
      // 2xx: done. 401: signed out (the action belongs to someone who is no longer here): dropped.
      if (res.ok) sent++;
      else skipped++;
      write(read().filter((x) => x.id !== a.id));
    }
  } finally {
    flushing = false;
  }
  if (skipped) window.dispatchEvent(new CustomEvent("rc:outbox-skipped", { detail: skipped }));
  if (sent || skipped) window.dispatchEvent(new Event("rc:synced"));
  return { sent, skipped };
}

/**
 * Forget everything this device kept for the staff app: waiting actions and the last data
 * received (service worker caches). Called at sign-out, when a PIN tablet locks, when the
 * person changes business and at the end of a shift.
 */
export async function clearStaffOffline() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (typeof caches !== "undefined") {
    for (const k of await caches.keys().catch(() => [] as string[])) if (k.startsWith("rc-app-data")) await caches.delete(k).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent("rc:outbox", { detail: 0 }));
}

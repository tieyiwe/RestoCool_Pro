import { sql } from "drizzle-orm";
import type { DB } from "@/db";

/**
 * Live events. One Postgres channel for the whole platform; each payload names its restaurant
 * (`r`), and the stream only forwards a restaurant's events to that restaurant's screens.
 * Payloads carry ids only: screens re-fetch through the normal, permission-checked APIs.
 */
export const CHANNEL = "rc_events";

export type RtEvent =
  | { k: "order"; r: string; o: string; s: string | null; d: string | null }
  | { k: "session"; r: string; s: string }
  | { k: "menu"; r: string }
  /** Someone asked to join the team, or a request was decided (staff screens only). */
  | { k: "join"; r: string }
  /** A message from the RestoCool team (r = a restaurant id, or « * » for many): staff screens only. */
  | { k: "notice"; r: string }
  /** A reservation was asked for, changed or cancelled (staff screens only, never customers). */
  | { k: "reservation"; r: string };

type Executor = Pick<DB, "execute">;

/** Inside a transaction, Postgres delivers the notification only when it commits. */
export async function notify(db: Executor, ev: RtEvent): Promise<void> {
  await db.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(ev)})`);
}

export function parseEvent(payload: string | undefined): RtEvent | null {
  if (!payload) return null;
  try {
    const ev = JSON.parse(payload) as RtEvent;
    return typeof ev?.r === "string" && (ev.k === "order" || ev.k === "session" || ev.k === "menu" || ev.k === "join" || ev.k === "notice" || ev.k === "reservation") ? ev : null;
  } catch {
    return null;
  }
}

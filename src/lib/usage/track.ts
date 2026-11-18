import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { appUsage } from "@/db/schema";

/** Business day (UTC = Ouagadougou). */
export const usageDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * One heartbeat from an open app screen. « view »: a page was opened; « beat »: the screen is
 * still visible (sent every minute). A minute counts once even with several tabs open.
 */
export async function recordUsage(db: DB, input: { restaurantId: string; memberId: string; kind: "view" | "beat"; path: string; via: "account" | "pin" }) {
  const path = input.path.slice(0, 200);
  const view = input.kind === "view" ? 1 : 0;
  await db
    .insert(appUsage)
    .values({ restaurantId: input.restaurantId, memberId: input.memberId, day: usageDay(), minutes: input.kind === "beat" ? 5 : 0, views: view, lastPath: path, via: input.via })
    .onConflictDoUpdate({
      target: [appUsage.restaurantId, appUsage.memberId, appUsage.day],
      set: {
        views: sql`${appUsage.views} + ${view}`,
        // A ping every 5 minutes counts 5 minutes (once, even with several tabs open).
        minutes: sql`${appUsage.minutes} + case when ${input.kind} = 'beat' and ${appUsage.lastAt} < now() - interval '270 seconds' then 5 else 0 end`,
        lastPath: path,
        via: input.via,
        lastAt: sql`now()`,
      },
    });
}

/** « Live now »: a heartbeat in the last 6 minutes (screens ping every 5). */
export const LIVE_WINDOW_SQL = sql`now() - interval '6 minutes'`;

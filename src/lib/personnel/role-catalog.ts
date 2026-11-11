import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { jobRoles, members, restaurants } from "@/db/schema";
import { catalogFor, LEVEL_TO_CATALOG } from "@/lib/auth/access";

// No "server-only" here: the seed script uses it too.
/**
 * Creates the ready-made roles the first time, and puts personnel who have no job role yet
 * (created before roles existed) on the catalog role matching their level.
 */
export async function ensureJobRoles(db: DB, restaurantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`jobroles:${restaurantId}`}))`);
    let rows = await tx.select({ id: jobRoles.id, key: jobRoles.key }).from(jobRoles).where(eq(jobRoles.restaurantId, restaurantId));
    const [r] = await tx.select({ kind: restaurants.kind }).from(restaurants).where(eq(restaurants.id, restaurantId));
    const kind = r?.kind ?? "restaurant";
    if (!rows.length) {
      rows = await tx
        .insert(jobRoles)
        .values(catalogFor(kind).map((c, i) => ({ restaurantId, key: c.key, group: c.group, access: [...c.access], sort: i + 1 })))
        .returning({ id: jobRoles.id, key: jobRoles.key });
    }
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    // On a bus, the « server » level is a hostess.
    const legacy = kind === "transport" ? { ...LEVEL_TO_CATALOG, server: "hostess" } : LEVEL_TO_CATALOG;
    for (const [level, key] of Object.entries(legacy)) {
      const id = byKey.get(key);
      if (!id) continue;
      await tx
        .update(members)
        .set({ jobRoleId: id })
        .where(and(eq(members.restaurantId, restaurantId), isNull(members.jobRoleId), eq(members.role, level as "server")));
    }
  });
}

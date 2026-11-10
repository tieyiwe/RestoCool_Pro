import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { jobRoles, members } from "@/db/schema";
import { LEVEL_TO_CATALOG, ROLE_CATALOG } from "@/lib/auth/access";

// No "server-only" here: the seed script uses it too.
/**
 * Creates the ready-made roles the first time, and puts personnel who have no job role yet
 * (created before roles existed) on the catalog role matching their level.
 */
export async function ensureJobRoles(db: DB, restaurantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`jobroles:${restaurantId}`}))`);
    let rows = await tx.select({ id: jobRoles.id, key: jobRoles.key }).from(jobRoles).where(eq(jobRoles.restaurantId, restaurantId));
    if (!rows.length) {
      rows = await tx
        .insert(jobRoles)
        .values(ROLE_CATALOG.map((c, i) => ({ restaurantId, key: c.key, group: c.group, access: [...c.access], sort: i + 1 })))
        .returning({ id: jobRoles.id, key: jobRoles.key });
    }
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    for (const [level, key] of Object.entries(LEVEL_TO_CATALOG)) {
      const id = byKey.get(key);
      if (!id) continue;
      await tx
        .update(members)
        .set({ jobRoleId: id })
        .where(and(eq(members.restaurantId, restaurantId), isNull(members.jobRoleId), eq(members.role, level as "server")));
    }
  });
}

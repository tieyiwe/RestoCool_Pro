import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobRoles } from "@/db/schema";

/** Id of a catalog job role (« server », « cook »…) of a restaurant. */
export async function roleId(restaurantId: string, key: string): Promise<string> {
  const r = await getDb().query.jobRoles.findFirst({ where: and(eq(jobRoles.restaurantId, restaurantId), eq(jobRoles.key, key)) });
  if (!r) throw new Error(`job role ${key} missing`);
  return r.id;
}

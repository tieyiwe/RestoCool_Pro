import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { accessCodes, restaurants } from "@/db/schema";
import { formatRc } from "@/lib/access-codes";

/**
 * Platform map (super admin, M7): every business that saved its location, as GeoJSON
 * (standard format for any free map library: Leaflet / MapLibre with OpenStreetMap tiles).
 */
export async function platformLocations(db: DB) {
  const rows = await db
    .select({
      id: restaurants.id,
      slug: restaurants.slug,
      name: restaurants.name,
      city: restaurants.city,
      lat: restaurants.latitude,
      lng: restaurants.longitude,
      published: restaurants.published,
      plan: restaurants.plan,
      planStatus: restaurants.planStatus,
      source: restaurants.locationSource,
      setAt: restaurants.locationSetAt,
      rc: accessCodes.code,
    })
    .from(restaurants)
    .leftJoin(accessCodes, and(eq(accessCodes.restaurantId, restaurants.id), sql`${accessCodes.seatId} is null`))
    .where(and(isNotNull(restaurants.latitude), isNotNull(restaurants.longitude)))
    .orderBy(asc(restaurants.name));
  return {
    type: "FeatureCollection" as const,
    features: rows.map((r) => ({
      type: "Feature" as const,
      // GeoJSON order is [longitude, latitude].
      geometry: { type: "Point" as const, coordinates: [r.lng!, r.lat!] as [number, number] },
      properties: {
        id: r.id,
        slug: r.slug,
        name: r.name,
        city: r.city,
        rc: r.rc ? formatRc(r.rc) : null,
        published: r.published,
        plan: r.plan,
        planStatus: r.planStatus,
        source: r.source,
        setAt: r.setAt?.toISOString() ?? null,
      },
    })),
  };
}

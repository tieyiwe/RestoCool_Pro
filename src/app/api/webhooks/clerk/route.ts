import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { findRestaurantByClerkOrg } from "@/db/repos/tenant";
import { writeAudit } from "@/lib/audit";
import { log } from "@/lib/log";
import { deactivateMember, ensureMember, ensureRestaurantForOrg, roleFromClerk } from "@/lib/restaurants/provision";

export const dynamic = "force-dynamic";

/**
 * Clerk → RestoCool sync. Subscribe in the Clerk dashboard to:
 * organization.created, organizationMembership.created, organizationMembership.updated,
 * organizationMembership.deleted. Every handler is idempotent (Clerk may retry).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let evt;
  try {
    evt = await verifyWebhook(req, { signingSecret: secret });
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const db = getDb();
  try {
    switch (evt.type) {
      case "organization.created": {
        await ensureRestaurantForOrg(db, { id: evt.data.id, name: evt.data.name });
        break;
      }
      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const d = evt.data;
        const restaurant = await ensureRestaurantForOrg(db, { id: d.organization.id, name: d.organization.name });
        const u = d.public_user_data;
        const member = await ensureMember(
          db,
          restaurant.id,
          {
            clerkUserId: u.user_id,
            role: roleFromClerk(d.role),
            email: u.identifier ?? null,
            name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
          },
          { reactivate: evt.type === "organizationMembership.created" },
        );
        await writeAudit(db, null, {
          restaurantId: restaurant.id,
          action: evt.type === "organizationMembership.created" ? "member.added" : "member.synced",
          entity: "member",
          entityId: member.id,
          data: { clerkRole: d.role },
        });
        break;
      }
      case "organizationMembership.deleted": {
        const d = evt.data;
        const restaurant = await findRestaurantByClerkOrg(db, d.organization.id);
        if (restaurant) {
          await deactivateMember(db, restaurant.id, d.public_user_data.user_id);
          await writeAudit(db, null, {
            restaurantId: restaurant.id,
            action: "member.removed",
            entity: "member",
            entityId: d.public_user_data.user_id,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    log.error("clerk_webhook_failed", { type: evt.type, err });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

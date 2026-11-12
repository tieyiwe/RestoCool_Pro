import type { DB } from "@/db";
import { auditLog } from "@/db/schema";
import type { Actor } from "./auth/can";

export type AuditEntry = {
  restaurantId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
};

type ActorRef = { type: "member" | "staff" | "superadmin" | "customer" | "system"; id: string | null };

export function actorRef(actor: Actor | null): ActorRef {
  if (!actor) return { type: "system", id: null };
  switch (actor.kind) {
    case "member":
      // PIN sessions are recorded under the person's member id (no account behind them).
      return actor.via === "pin" && actor.memberId ? { type: "staff", id: actor.memberId } : { type: "member", id: actor.userId };
    case "staff":
      return { type: "staff", id: actor.staffId };
    case "superadmin":
      // Console people are recorded by their (verified) email: their activity log follows it.
      return { type: "superadmin", id: actor.email ? actor.email.toLowerCase() : actor.userId };
    case "customer":
      return { type: "customer", id: actor.deviceId };
  }
}

/** Accepts the db or a transaction, so the log row commits with the change it describes. */
export async function writeAudit(db: Pick<DB, "insert">, actor: Actor | null, entry: AuditEntry): Promise<void> {
  const ref = actorRef(actor);
  await db.insert(auditLog).values({
    restaurantId: entry.restaurantId,
    actorType: ref.type,
    actorId: ref.id,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    data: entry.data ?? null,
    ip: entry.ip ?? null,
  });
}

import "server-only";
import type { DB } from "@/db";
import type { MemberContext } from "@/lib/auth/context";
import { unreadForBusiness } from "@/lib/support/requests";
import { messagesFor } from "./messages";

const isLead = (role: string) => role === "owner" || role === "manager";

/** What the bell shows: unread messages from RestoCool + unread answers to support requests. */
export async function notificationSummary(db: DB, ctx: MemberContext, locale: string) {
  const memberId = ctx.actor.memberId;
  if (!memberId) return { unread: 0, support: 0, popup: null };
  const v = { memberId, restaurantId: ctx.repo.restaurantId, role: ctx.actor.role };
  const [msgs, support] = await Promise.all([messagesFor(db, v), unreadForBusiness(db, ctx.repo.restaurantId, isLead(ctx.actor.role) ? null : memberId)]);
  const p = msgs.find((m) => m.popup && !m.read);
  const pick = (x: { fr: string; en?: string; zh?: string }) => (x as Record<string, string | undefined>)[locale] || x.fr;
  return {
    unread: msgs.filter((m) => !m.read).length,
    support,
    popup: p ? { id: p.id, kind: p.kind, title: pick(p.title), body: pick(p.body), link: p.link } : null,
  };
}

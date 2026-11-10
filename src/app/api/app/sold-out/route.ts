import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { menuCategories, menuItems } from "@/db/schema";
import { requireMember } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { setSoldOutToday } from "@/lib/menu/service";

export const dynamic = "force-dynamic";

/** Dishes with their « épuisé aujourd'hui » state, for the one-tap list (kitchen, front desk). */
export const GET = handle(async () => {
  const m = await requireMember("menu.soldOut");
  const now = new Date();
  const rows = await getDb()
    .select({ id: menuItems.id, code: menuItems.code, name: menuItems.name, soldOutUntil: menuItems.soldOutUntil, category: menuCategories.name })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(and(eq(menuItems.restaurantId, m.repo.restaurantId), eq(menuItems.available, true)))
    .orderBy(asc(menuCategories.sort), asc(menuItems.sort));
  return NextResponse.json(
    { items: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, category: r.category, soldOut: Boolean(r.soldOutUntil && r.soldOutUntil > now) })) },
    { headers: { "Cache-Control": "no-store" } },
  );
});

const Body = z.object({ itemId: z.uuid(), soldOut: z.boolean() });

export const POST = handle(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => null));
  const m = await requireMember("menu.soldOut");
  await setSoldOutToday({ db: getDb(), actor: m.actor, repo: m.repo }, body.itemId, body.soldOut);
  return NextResponse.json({ ok: true });
});

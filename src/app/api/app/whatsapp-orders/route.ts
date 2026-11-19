import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { whatsappOrders } from "@/lib/orders/whatsapp";

export const dynamic = "force-dynamic";

/** WhatsApp takeaway orders to handle (every plan: it is how free businesses take orders). */
export const GET = handle(async () => {
  const m = await requireMember("orders.read");
  return NextResponse.json(await whatsappOrders(getDb(), m.repo.restaurantId), { headers: { "Cache-Control": "no-store" } });
});

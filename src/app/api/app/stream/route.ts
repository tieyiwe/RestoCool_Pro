import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";
import { sseResponse } from "@/lib/realtime/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Staff live stream (front desk, kitchen): every order, session and menu event of their restaurant. */
export const GET = handle(async (req: Request) => {
  const ctx = await serviceCtx("orders.read");
  const rid = ctx.repo.restaurantId;
  return sseResponse(req, (ev) => (ev.r === rid ? ev.k : null));
});

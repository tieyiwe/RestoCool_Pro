import QRCode from "qrcode";
import { z } from "zod";
import { getDb } from "@/db";
import { ordersForCustomer } from "@/lib/orders/service";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { publicBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

const Query = z.object({ slug: Slug, deviceId: DeviceId });

/**
 * QR of « Montrer au serveur »: the staff link of this order (/app/orders/{id}), which only a
 * signed-in member of the restaurant can open. Made on the server: no QR library on the phone.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!id.success || !q.success) return notFound();
  if (!allow(req, q.data.deviceId)) return tooMany();
  const r = await publicRestaurant(q.data.slug);
  if (!r) return notFound();
  const { orders } = await ordersForCustomer(getDb(), r.id, q.data.deviceId, null);
  if (!orders.some((o) => o.id === id.data)) return notFound();
  const svg = await QRCode.toString(`${await publicBaseUrl()}/app/orders/${id.data}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
}

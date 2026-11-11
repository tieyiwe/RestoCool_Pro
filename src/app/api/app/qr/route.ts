import { brandedQrPng } from "@/lib/qr-branded";
import { z } from "zod";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError, PlanLimitError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { hasFeature } from "@/lib/plan";
import { slugify } from "@/lib/slug";
import { menuUrl, publicBaseUrl, seatUrl } from "@/lib/urls";
import { seats } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

const Query = z.object({ seat: z.union([z.literal("generic"), z.uuid()]) });

/** High-resolution PNG of a seat's QR (or the generic restaurant QR), for download. */
export const GET = handle(async (req: Request) => {
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { repo } = await requireMember("seats.write");
  const r = await repo.restaurant.get();
  if (!r) throw new NotFoundError();
  const base = await publicBaseUrl();
  let text: string;
  let name: string;
  if (q.seat === "generic") {
    text = menuUrl(base, r.slug);
    name = `${r.slug}-qr`;
  } else {
    if (!hasFeature(r, "qrPerSeat")) throw new PlanLimitError("qrPerSeat");
    const seat = await getDb().query.seats.findFirst({ where: and(eq(seats.restaurantId, repo.restaurantId), eq(seats.id, q.seat)) });
    if (!seat) throw new NotFoundError();
    text = seatUrl(base, r.slug, seat.qrToken);
    name = `${r.slug}-${slugify(`${seat.type}-${seat.label}`)}`;
  }
  const png = brandedQrPng(text, { width: 1024 });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${name}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
});

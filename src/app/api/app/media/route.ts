import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { requireMember } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { IMAGE_LIMITS, isWebp } from "@/lib/image/webp";
import { getStore, mediaUrl } from "@/lib/storage";
import { randomToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const Meta = z.object({
  kind: z.enum(["item", "logo", "cover"]),
  width: z.coerce.number().int().min(1).max(IMAGE_LIMITS.fullMaxSide),
  height: z.coerce.number().int().min(1).max(IMAGE_LIMITS.fullMaxSide),
});

async function readWebp(value: FormDataEntryValue | null, maxBytes: number): Promise<Buffer> {
  if (!(value instanceof Blob)) throw new AppError("invalid_image", 400);
  if (value.size === 0 || value.size > maxBytes) throw new AppError("image_too_large", 413);
  const bytes = Buffer.from(await value.arrayBuffer());
  if (!isWebp(bytes)) throw new AppError("invalid_image", 400);
  return bytes;
}

/**
 * Upload a photo already compressed in the browser (full WebP + 168px thumbnail).
 * Item photos need menu.write; logo and cover need settings.write.
 */
export const POST = handle(async (req: Request) => {
  const form = await req.formData();
  const meta = Meta.parse({ kind: form.get("kind"), width: form.get("width"), height: form.get("height") });
  const { actor, repo } = await requireMember(meta.kind === "item" ? "menu.write" : "settings.write");

  const full = await readWebp(form.get("full"), IMAGE_LIMITS.fullMaxBytes);
  const thumb = await readWebp(form.get("thumb"), IMAGE_LIMITS.thumbMaxBytes);

  const base = `r/${repo.restaurantId}/${randomToken(16)}`;
  const fullKey = `${base}.webp`;
  const thumbKey = `${base}-t.webp`;
  const store = getStore();
  await store.put(fullKey, full);
  await store.put(thumbKey, thumb);

  const db = getDb();
  const [row] = await db
    .insert(media)
    .values({
      restaurantId: repo.restaurantId,
      kind: meta.kind,
      fullKey,
      thumbKey,
      bytes: full.length + thumb.length,
      width: meta.width,
      height: meta.height,
      uploadedBy: actor.userId,
    })
    .returning();
  await writeAudit(db, actor, { restaurantId: repo.restaurantId, action: "media.uploaded", entity: "media", entityId: row!.id, data: { kind: meta.kind, bytes: row!.bytes } });

  return NextResponse.json({ id: row!.id, fullUrl: mediaUrl(fullKey), thumbUrl: mediaUrl(thumbKey), bytes: row!.bytes });
});

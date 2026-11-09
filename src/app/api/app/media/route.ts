import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { requireMember } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { detectImageFormat, IMAGE_LIMITS, type ImageFormat } from "@/lib/image/webp";
import { getStore, mediaUrl } from "@/lib/storage";
import { randomToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const Meta = z.object({
  kind: z.enum(["item", "logo", "cover"]),
  width: z.coerce.number().int().min(1).max(IMAGE_LIMITS.fullMaxSide),
  height: z.coerce.number().int().min(1).max(IMAGE_LIMITS.fullMaxSide),
});

/** Both images plus multipart overhead and the small text fields. */
const MAX_BODY_BYTES = IMAGE_LIMITS.fullMaxBytes + IMAGE_LIMITS.thumbMaxBytes + 16 * 1024;

async function readImage(value: FormDataEntryValue | null, maxBytes: number): Promise<{ bytes: Buffer; format: ImageFormat }> {
  if (!(value instanceof Blob)) throw new AppError("invalid_image", 400);
  if (value.size === 0 || value.size > maxBytes) throw new AppError("image_too_large", 413);
  const bytes = Buffer.from(await value.arrayBuffer());
  const format = detectImageFormat(bytes); // checked from the bytes, never from the declared type
  if (!format) throw new AppError("invalid_image", 400);
  return { bytes, format };
}

/**
 * Upload a photo already compressed in the browser (full WebP + 168px thumbnail).
 * Item photos need menu.write; logo and cover need settings.write.
 */
export const POST = handle(async (req: Request) => {
  // Authenticate and bound the body size BEFORE buffering the multipart form in memory.
  // Every role that may upload anything has menu.write (logo/cover additionally need settings.write).
  await requireMember("menu.write");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) throw new AppError("image_too_large", 413);

  const form = await req.formData();
  const meta = Meta.parse({ kind: form.get("kind"), width: form.get("width"), height: form.get("height") });
  const { actor, repo } = await requireMember(meta.kind === "item" ? "menu.write" : "settings.write");

  const fullImg = await readImage(form.get("full"), IMAGE_LIMITS.fullMaxBytes);
  const thumbImg = await readImage(form.get("thumb"), IMAGE_LIMITS.thumbMaxBytes);
  const full = fullImg.bytes;
  const thumb = thumbImg.bytes;

  const base = `r/${repo.restaurantId}/${randomToken(16)}`;
  const fullKey = `${base}.${fullImg.format}`;
  const thumbKey = `${base}-t.${thumbImg.format}`;
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

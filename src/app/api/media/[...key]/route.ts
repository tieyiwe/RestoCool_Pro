import { getStore, MEDIA_KEY_RE } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Public, immutable image delivery (keys are random and never reused). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!MEDIA_KEY_RE.test(key)) return new Response("Not found", { status: 404 });
  const bytes = await getStore().get(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": key.endsWith(".jpg") ? "image/jpeg" : "image/webp",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

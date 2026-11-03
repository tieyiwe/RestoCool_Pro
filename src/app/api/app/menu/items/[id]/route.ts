import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

const Params = z.object({ id: z.uuid() });

/** One item, only if it belongs to the caller's restaurant: another tenant's id is a 404. */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const parsed = Params.safeParse(await params);
  if (!parsed.success) throw new NotFoundError();
  const { repo } = await requireMember("menu.read");
  const item = await repo.menu.item(parsed.data.id);
  if (!item) throw new NotFoundError();
  return NextResponse.json({ item });
});

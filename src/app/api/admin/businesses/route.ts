import { getDb } from "@/db";
import { BusinessFilter, listBusinesses } from "@/lib/admin/businesses";
import { requireSuperadmin } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { csvCell } from "@/lib/orders/history";

export const dynamic = "force-dynamic";

/** CSV of the businesses list (same filters as the page), for the super admin only. */
export const GET = handle(async (req: Request) => {
  await requireSuperadmin();
  const f = BusinessFilter.parse(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await listBusinesses(getDb(), f);
  const head = ["name", "slug", "rc", "kind", "city", "owner", "owner_email", "plan", "status", "until", "published", "items", "orders_30d", "gmv_30d_fcfa", "last_order", "created"];
  const lines = rows.map((b) =>
    [b.name, b.slug, b.rc ? `RC-${b.rc}` : "", b.kind, b.city ?? "", b.ownerName ?? "", b.ownerEmail ?? "", b.plan, b.status, b.planExpiresAt?.toISOString().slice(0, 10) ?? "", b.published ? "yes" : "no", b.items, b.orders30, b.gmv30, b.lastOrderAt?.toISOString() ?? "", b.createdAt.toISOString()]
      .map(csvCell)
      .join(","),
  );
  const body = "﻿" + [head.join(","), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="restocool-etablissements-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

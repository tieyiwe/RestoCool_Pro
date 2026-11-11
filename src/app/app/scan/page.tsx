import { getTranslations } from "next-intl/server";
import { Scanner } from "@/components/scan/scanner";
import { requireMemberPage } from "@/lib/auth/page";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** « Scanner »: the customer's order QR, the check-in QR, or a table / menu QR. */
export default async function ScanPage({ searchParams }: { searchParams: Promise<{ trip?: string; round?: string }> }) {
  const ctx = await requireMemberPage("restaurant.read");
  const t = await getTranslations("scan");
  const sp = await searchParams;
  // « Tournée » (bus): from a trip, scan the travelers' order QR codes one after another.
  const uuid = /^[0-9a-f-]{36}$/i;
  const trip = sp.trip && uuid.test(sp.trip) ? await getDb().query.trips.findFirst({ where: (x, { and, eq }) => and(eq(x.id, sp.trip!), eq(x.restaurantId, ctx.repo.restaurantId), eq(x.status, "open")) }) : null;
  const initial = (sp.round ?? "").split(",").filter((x) => uuid.test(x)).slice(0, 200);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">{trip ? t("roundTitle") : t("title")}</h1>
        <p className="text-muted-foreground">{trip ? t("roundIntro", { route: trip.route }) : t("intro")}</p>
      </div>
      <Scanner {...(trip ? { round: { tripId: trip.id, initial } } : {})} />
    </div>
  );
}

import Link from "next/link";
import { adminI18n } from "@/lib/admin/i18n";
import { PlatformMap, type MapPoint } from "@/components/admin/platform-map";
import { getDb } from "@/db";
import { requireSuperadminPage } from "@/lib/auth/context";
import { platformLocations } from "@/lib/platform/locations";

export const dynamic = "force-dynamic";

/** Where the businesses are: every business that saved its location (GPS or Google Maps link). */
export default async function AdminMap() {
  await requireSuperadminPage("businesses.read");
  const [t, geo] = await Promise.all([adminI18n().then((x) => x.t), platformLocations(getDb())]);
  const points: MapPoint[] = geo.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    city: f.properties.city ?? null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    published: Boolean(f.properties.published),
    rc: (f.properties as { rc?: string | null }).rc ?? null,
  }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t("map.title")}</h1>
        <p className="text-muted-foreground">{t("map.intro", { n: points.length })}</p>
      </div>
      <PlatformMap points={points} labels={{ open: t("map.title"), draft: t("draft") }} />
      <p className="text-sm text-muted-foreground">
        🟢 {t("published")} · 🟡 {t("draft")} ·{" "}
        <Link href="/admin_pro/businesses" className="font-semibold text-primary">
          {t("map.missing")}
        </Link>
      </p>
    </div>
  );
}

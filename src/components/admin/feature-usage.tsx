import { Card, CardTitle } from "@/components/ui/card";
import type { FeatureUsage } from "@/lib/admin/features";

type T = (key: string, values?: Record<string, string | number>) => string;

function Row({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1" data-testid={testId}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </li>
  );
}

/**
 * « Feature usage » (console): the recent customer and service features at a glance — shared
 * selections, tables freed by staff or closed by themselves, reviews, feature switches, and the
 * version that is running. Platform-wide on the overview, per business on its page.
 */
export function FeatureUsageCard({ u, t, version, perBusiness = false }: { u: FeatureUsage; t: T; version?: string; perBusiness?: boolean }) {
  const autoClosed = u.tables.closedFinished + u.tables.closedInactive + u.tables.closedExpired + u.tables.closedStale;
  return (
    <Card data-testid="feature-usage">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>{t("features.title")}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {t("features.period")}
          {version ? ` · ${t("features.version", { v: version.slice(0, 12) })}` : ""}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <section data-testid="feature-shared">
          <h3 className="font-semibold">👥 {t("features.shared.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t("features.shared.created")} value={u.shared.created} testId="fu-shared-created" />
            <Row label={t("features.shared.sent")} value={u.shared.sent} testId="fu-shared-sent" />
            <Row label={t("features.shared.stopped")} value={u.shared.stopped} />
            <Row label={t("features.shared.guests")} value={u.shared.guests} testId="fu-shared-guests" />
            <Row label={t("features.shared.lines")} value={u.shared.namedLines} />
            <Row label={t("features.shared.openNow")} value={u.shared.openNow} />
            {!perBusiness && <Row label={t("features.shared.businesses")} value={u.switches.sharingBusinesses} />}
          </ul>
        </section>
        <section data-testid="feature-tables">
          <h3 className="font-semibold">🪑 {t("features.tables.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t("features.tables.openNow")} value={u.tables.openNow} />
            <Row label={t("features.tables.released")} value={u.tables.releasedByStaff} testId="fu-tables-released" />
            <Row label={t("features.tables.byCustomer")} value={u.tables.closedByCustomer} />
            <Row label={t("features.tables.auto")} value={autoClosed} />
            <Row label={t("features.tables.finished")} value={u.tables.closedFinished} />
            <Row label={t("features.tables.inactive")} value={u.tables.closedInactive + u.tables.closedExpired} />
            <Row label={t("features.tables.stale")} value={u.tables.closedStale} />
          </ul>
        </section>
        <section data-testid="feature-reviews">
          <h3 className="font-semibold">⭐ {t("features.reviews.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t("features.reviews.count")} value={u.reviews.count} />
            <Row label={t("features.reviews.average")} value={u.reviews.average == null ? "—" : `${u.reviews.average.toFixed(1)} ★`} />
            <Row label={t("features.reviews.hidden")} value={u.reviews.hidden} />
            <Row label={t("features.reviews.deleted")} value={u.reviews.deleted} />
            <Row label={t(perBusiness ? "features.switches.reviewsOffOne" : "features.switches.reviewsOff")} value={perBusiness ? (u.switches.reviewsOff ? t("features.no") : t("features.yes")) : u.switches.reviewsOff} />
            <Row label={t(perBusiness ? "features.switches.attendanceOffOne" : "features.switches.attendanceOff")} value={perBusiness ? (u.switches.attendanceOff ? t("features.no") : t("features.yes")) : u.switches.attendanceOff} />
          </ul>
        </section>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("features.offlineNote")}</p>
    </Card>
  );
}

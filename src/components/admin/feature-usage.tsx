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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section data-testid="feature-whatsapp">
          <h3 className="font-semibold">💬 {t("features.whatsapp.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t("features.whatsapp.orders")} value={u.whatsapp.orders} testId="fu-wa-orders" />
            <Row label={t("features.whatsapp.handedOver")} value={u.whatsapp.handedOver} />
            <Row label={t("features.whatsapp.open")} value={u.whatsapp.open} />
            <Row label={t("features.whatsapp.cancelled")} value={u.whatsapp.cancelled} />
            <Row label={t("features.whatsapp.amount")} value={`${u.whatsapp.amount.toLocaleString("fr-FR")} F`} />
            {!perBusiness && <Row label={t("features.whatsapp.businesses")} value={u.whatsapp.businesses} />}
          </ul>
        </section>
        <section data-testid="feature-service-types">
          <h3 className="font-semibold">🍽️🛍️🛵 {t("features.serviceTypes.title")}</h3>
          <ul className="divide-y divide-border">
            {perBusiness ? (
              <Row
                label={t("features.serviceTypes.this")}
                value={[u.serviceTypes.dineIn ? t("features.serviceTypes.dineInShort") : null, u.serviceTypes.takeaway ? t("features.serviceTypes.takeawayShort") : null, u.serviceTypes.delivery ? t("features.serviceTypes.deliveryShort") : null].filter(Boolean).join(" · ") || "—"}
              />
            ) : (
              <>
                <Row label={t("features.serviceTypes.dineIn")} value={u.serviceTypes.dineIn} testId="fu-dine-in" />
                <Row label={t("features.serviceTypes.takeawayOnly")} value={u.serviceTypes.takeawayOnly} />
                <Row label={t("features.serviceTypes.takeaway")} value={u.serviceTypes.takeaway} />
                <Row label={t("features.serviceTypes.delivery")} value={u.serviceTypes.delivery} />
              </>
            )}
          </ul>
        </section>
        <section data-testid="feature-service">
          <h3 className="font-semibold">🍽️ {t("features.service.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t("features.service.staffOrders")} value={u.service.staffOrders} testId="fu-staff-orders" />
            <Row label={t("features.service.assignedOrders")} value={u.service.assignedOrders} />
            <Row label={t("features.service.planDays")} value={u.service.planDays} />
            <Row label={t("features.service.billRequests")} value={u.service.billRequests} />
            {!perBusiness && <Row label={t("features.service.staffBusinesses")} value={u.service.staffBusinesses} />}
            {!perBusiness && <Row label={t("features.service.planBusinesses")} value={u.service.planBusinesses} />}
          </ul>
        </section>
        <section data-testid="feature-cashier">
          <h3 className="font-semibold">💰 {t("features.cashier.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t("features.cashier.collected")} value={`${u.cashier.collected.toLocaleString("fr-FR")} F`} testId="fu-cash-collected" />
            <Row label={t("features.cashier.bills")} value={u.cashier.bills} />
            <Row label={t("features.cashier.averageTicket")} value={`${u.cashier.averageTicket.toLocaleString("fr-FR")} F`} />
            {(["cash", "orange_money", "moov_money", "card", "other"] as const).map((m) => (
              <Row key={m} label={`· ${t(`features.cashier.m_${m}`)}`} value={`${(u.cashier.byMethod[m] ?? 0).toLocaleString("fr-FR")} F`} />
            ))}
            <Row label={t("features.cashier.discounts")} value={`${u.cashier.discounts.toLocaleString("fr-FR")} F`} />
            {!perBusiness && <Row label={t("features.cashier.businesses")} value={u.cashier.businesses} />}
          </ul>
        </section>
        <section data-testid="feature-reservations">
          <h3 className="font-semibold">📅 {t("features.reservations.title")}</h3>
          <ul className="divide-y divide-border">
            <Row label={t(perBusiness ? "features.reservations.onOne" : "features.reservations.on")} value={perBusiness ? (u.switches.reservationsOn ? t("features.yes") : t("features.no")) : u.switches.reservationsOn} testId="fu-resv-on" />
            <Row label={t("features.reservations.total")} value={u.reservations.total} testId="fu-resv-total" />
            <Row label={t("features.reservations.covers")} value={u.reservations.covers} />
            <Row label={t("features.reservations.waiting")} value={u.reservations.requested} testId="fu-resv-waiting" />
            <Row label={t("features.reservations.confirmed")} value={u.reservations.confirmed} />
            <Row label={t("features.reservations.honoured")} value={u.reservations.honoured} testId="fu-resv-honoured" />
            <Row label={t("features.reservations.called")} value={u.reservations.called} />
            <Row label={t("features.reservations.declined")} value={u.reservations.declined + u.reservations.cancelled} />
            <Row label={t("features.reservations.noShow")} value={u.reservations.noShow} />
            <Row label={t("features.reservations.byQr")} value={u.reservations.byQr} testId="fu-resv-qr" />
            <Row label={t("features.reservations.showRate")} value={u.reservations.showRate === null ? "—" : `${u.reservations.showRate} %`} testId="fu-resv-rate" />
            <Row label={t("features.reservations.expired")} value={u.reservations.expired} />
            <Row label={t(perBusiness ? "features.reservations.waitNowOne" : "features.reservations.waitNow")} value={perBusiness ? (u.reservations.waitNow ? t("features.yes") : t("features.no")) : u.reservations.waitNow} />
            <Row label={t("features.reservations.waitSet")} value={u.reservations.waitSet} />
          </ul>
        </section>
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

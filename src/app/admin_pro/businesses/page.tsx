import Link from "next/link";
import { adminI18n } from "@/lib/admin/i18n";
import { getDb } from "@/db";
import { BusinessFilter, listBusinesses } from "@/lib/admin/businesses";
import { requireSuperadminPage } from "@/lib/auth/context";
import { formatFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  trial: "bg-sky-100 text-sky-900",
  active: "bg-emerald-100 text-emerald-900",
  past_due: "bg-amber-100 text-amber-900",
  suspended: "bg-red-100 text-red-900",
};
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";

/** Every business on the platform: search (name, address, town, owner email, numéro RC), filters, export. */
export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSuperadminPage("businesses.read");
  const sp = await searchParams;
  const f = BusinessFilter.parse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)));
  const [t, tp, format, rows] = await Promise.all([adminI18n().then((x) => x.t), adminI18n().then((x) => x.tp), adminI18n().then((x) => x.format), listBusinesses(getDb(), f)]);
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== "all") as [string, string][]).toString();
  // Phones: the search stays visible, the other filters fold behind « Filtres » (open when one is set).
  const anyFilter = (["plan", "status", "kind", "published"] as const).some((k) => f[k] && f[k] !== "all") || (f.sort && f.sort !== "recent");
  const sel = (name: keyof typeof f, options: readonly string[], label: (v: string) => string) => (
    <label className="hidden text-sm peer-checked:block sm:block">
      <span className="mb-1 block font-semibold">{t(`filters.${name}`)}</span>
      <select name={name} defaultValue={f[name]} className={field}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "all" ? t("filters.all") : label(o)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="flex flex-col gap-4" data-testid="admin-businesses">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("businesses.title")}</h1>
          <p className="text-muted-foreground">{t("businesses.count", { n: rows.length })}</p>
        </div>
        <a href={`/api/admin/businesses?${query}`} download className="min-h-11 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold" data-testid="admin-export">
          ⬇ {t("businesses.export")}
        </a>
      </div>
      <form className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-3 lg:grid-cols-[2fr_repeat(5,1fr)_auto] lg:items-end" data-testid="admin-filters">
        <label className="text-sm sm:col-span-3 lg:col-span-1">
          <span className="mb-1 block font-semibold">{t("filters.q")}</span>
          <input name="q" type="search" defaultValue={f.q} placeholder={t("filters.qPlaceholder")} className={field} data-testid="admin-search" />
        </label>
        <input type="checkbox" id="more-filters" className="peer sr-only" defaultChecked={anyFilter} />
        <label htmlFor="more-filters" className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold peer-focus-visible:ring-2 sm:hidden" data-testid="admin-more-filters">
          ⚙️ {t("filters.more")}
        </label>
        {sel("plan", ["all", "gratuit", "pro", "business"], (v) => tp(v))}
        {sel("status", ["all", "trial", "active", "past_due", "suspended"], (v) => tp(v))}
        {sel("kind", ["all", "restaurant", "transport"], (v) => t(`kinds.${v}`))}
        {sel("published", ["all", "yes", "no"], (v) => t(v === "yes" ? "yes" : "no"))}
        {sel("sort", ["recent", "name", "orders", "expiry"], (v) => t(`filters.sorts.${v}`))}
        <button className="min-h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground">{t("filters.apply")}</button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted-foreground">{t("businesses.none")}</p>
      ) : (
        <>
        {/* Phones: one card per business (the table needs a wide screen). */}
        <ul className="flex flex-col gap-2 md:hidden" data-testid="admin-business-cards">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/admin_pro/businesses/${b.id}`} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-3 active:bg-muted" data-testid="admin-business-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">
                    {b.kind === "transport" ? "🚌 " : ""}
                    {b.name}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[b.status] ?? ""}`}>
                    {tp(b.plan)} · {tp(b.status)}
                  </span>
                </div>
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{b.city ?? "—"}</span>
                  {b.rc && <span className="font-mono">RC-{b.rc}</span>}
                  {!b.published && <span className="font-semibold text-amber-700">{t("draft")}</span>}
                  {!b.setupDone && <span>{t("setupPending")}</span>}
                  {b.featuredRank && <span>★ {b.featuredRank}</span>}
                </p>
                {(b.ownerName || b.ownerEmail) && <p className="truncate text-xs">👤 {b.ownerName ?? b.ownerEmail}</p>}
                <p className="flex flex-wrap gap-x-3 text-xs">
                  <span>
                    {t("cols.orders30")} <b className="tabular-nums">{b.orders30}</b>
                  </span>
                  <span>
                    {t("cols.gmv30")} <b className="tabular-nums">{formatFCFA(b.gmv30) ?? "0 F"}</b>
                  </span>
                  <span className="text-muted-foreground">{b.lastOrderAt ? format.relativeTime(b.lastOrderAt) : "—"}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="p-3">{t("cols.business")}</th>
                <th className="p-3">{t("cols.owner")}</th>
                <th className="p-3">{t("cols.plan")}</th>
                <th className="p-3">{t("cols.until")}</th>
                <th className="p-3 text-right">{t("cols.items")}</th>
                <th className="p-3 text-right">{t("cols.orders30")}</th>
                <th className="p-3 text-right">{t("cols.gmv30")}</th>
                <th className="p-3">{t("cols.lastOrder")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-muted/50" data-testid="admin-business-row">
                  <td className="p-3">
                    <Link href={`/admin_pro/businesses/${b.id}`} className="font-bold hover:underline">
                      {b.kind === "transport" ? "🚌 " : ""}
                      {b.name}
                    </Link>
                    <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{b.city ?? "—"}</span>
                      {b.rc && <span className="font-mono">RC-{b.rc}</span>}
                      {!b.published && <span className="font-semibold text-amber-700">{t("draft")}</span>}
                      {!b.setupDone && <span>{t("setupPending")}</span>}
                      {b.featuredRank && <span>★ {b.featuredRank}</span>}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    <div>{b.ownerName ?? "—"}</div>
                    <div className="text-muted-foreground">{b.ownerEmail ?? ""}</div>
                  </td>
                  <td className="p-3">
                    <span className="font-semibold">{tp(b.plan)}</span>{" "}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[b.status] ?? ""}`}>{tp(b.status)}</span>
                  </td>
                  <td className="p-3 text-xs">{b.planExpiresAt ? format.dateTime(b.planExpiresAt, { dateStyle: "medium" }) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{b.items}</td>
                  <td className="p-3 text-right tabular-nums">{b.orders30}</td>
                  <td className="p-3 text-right tabular-nums">{formatFCFA(b.gmv30) ?? "0 F"}</td>
                  <td className="p-3 text-xs">{b.lastOrderAt ? format.relativeTime(b.lastOrderAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

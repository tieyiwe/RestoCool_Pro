import { getTranslations } from "next-intl/server";
import { selectRestaurantAction } from "@/app/app/actions";
import { getMemberContext } from "@/lib/auth/context";

/** Shown only when the user belongs to more than one restaurant. Works without client JS. */
export async function RestaurantSwitcher() {
  const ctx = await getMemberContext();
  if (!ctx || ctx.memberships.length < 2) return null;
  const t = await getTranslations("app");
  const tc = await getTranslations("common");
  return (
    <form action={selectRestaurantAction} className="flex items-center gap-1">
      <label className="sr-only" htmlFor="restaurant-switcher">
        {t("switchRestaurant")}
      </label>
      <select
        id="restaurant-switcher"
        name="restaurantId"
        defaultValue={ctx.repo.restaurantId}
        className="min-h-11 max-w-40 rounded-lg border border-border bg-surface px-2 text-sm"
      >
        {ctx.memberships.map((m) => (
          <option key={m.restaurantId} value={m.restaurantId}>
            {m.restaurantName}
          </option>
        ))}
      </select>
      <button type="submit" className="min-h-11 rounded-lg px-2 text-sm font-semibold hover:bg-muted">
        {tc("apply")}
      </button>
    </form>
  );
}

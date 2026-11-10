import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PLANS } from "@/config/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getMemberContext } from "@/lib/auth/context";
import { setupState } from "@/lib/auth/setup";
import { can } from "@/lib/auth/can";
import { formatFCFA } from "@/lib/format";
import { pickText } from "@/i18n/config";
import {
  availableAction,
  createCategoryAction,
  deleteCategoryAction,
  deleteItemAction,
  duplicateItemAction,
  moveCategoryAction,
  moveItemAction,
  soldOutAction,
  updateCategoryAction,
} from "./actions";

const btn = "min-h-11 min-w-11 rounded-lg px-2 text-sm font-semibold hover:bg-muted";
const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3";

export default async function MenuManagerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/app/new");
  if ((await setupState()) === "setup") redirect("/app/onboarding/1");
  const t = await getTranslations("menuAdmin");
  const locale = await getLocale();
  const { error } = await searchParams;
  const canWrite = can(ctx.actor, "menu.write", { restaurantId: ctx.repo.restaurantId });
  const [restaurant, categories, items, variants] = await Promise.all([
    ctx.repo.restaurant.get(),
    ctx.repo.menu.categories(),
    ctx.repo.menu.items(),
    ctx.repo.menu.variants(),
  ]);
  if (!restaurant) redirect("/app");
  const limit = PLANS[restaurant.plan].limits.menuItems;
  const now = Date.now();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
          {Number.isFinite(limit) && (
            <p className="mt-1 text-sm font-semibold" data-testid="item-usage">
              {t("usage", { count: items.length, limit })}
            </p>
          )}
        </div>
        <Button asChild variant="outline">
          <Link href={`/r/${restaurant.slug}`} target="_blank">
            {t("previewMenu")} ↗
          </Link>
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error === "category_not_empty" ? t("categoryNotEmpty") : error === "plan_limit" ? t("planLimit") : t("errorGeneric")}
        </p>
      )}

      {categories.length === 0 && <Card className="text-center text-muted-foreground">{t("emptyMenu")}</Card>}

      {categories.map((c, ci) => {
        const catItems = items.filter((i) => i.categoryId === c.id);
        return (
          <Card key={c.id} className="p-0" data-testid="category">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <h2 className="flex-1 text-lg font-bold">
                {pickText(c.name, locale)}
                {!c.active && (
                  <Badge variant="muted" className="ml-2">
                    {t("hiddenCategory")}
                  </Badge>
                )}
                {c.timeWindow && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {c.timeWindow.from}–{c.timeWindow.to}
                  </span>
                )}
              </h2>
              {canWrite && (
                <div className="flex items-center">
                  <form action={moveCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button name="dir" value="up" className={btn} aria-label={t("moveUp")} disabled={ci === 0}>
                      ↑
                    </button>
                    <button name="dir" value="down" className={btn} aria-label={t("moveDown")} disabled={ci === categories.length - 1}>
                      ↓
                    </button>
                  </form>
                  <form action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton message={t("confirmDelete")}>{t("delete")}</ConfirmButton>
                  </form>
                </div>
              )}
            </div>

            {canWrite && (
              <details className="border-b border-border px-3 py-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">{t("rename")}</summary>
                <form action={updateCategoryAction} className="grid gap-2 py-2 sm:grid-cols-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name_fr" defaultValue={c.name.fr} required aria-label="FR" className={input} />
                  <input name="name_en" defaultValue={c.name.en ?? ""} aria-label="EN" placeholder="EN" className={input} />
                  <input name="name_zh" defaultValue={c.name.zh ?? ""} aria-label="ZH" placeholder="中文" className={input} />
                  <label className="flex items-center gap-2 text-sm sm:col-span-3">
                    <input type="hidden" name="active" value="off" />
                    <input type="checkbox" name="active" defaultChecked={c.active} className="h-5 w-5" />
                    {t("showCategory")}
                  </label>
                  <fieldset className="flex flex-wrap items-center gap-2 text-sm sm:col-span-3">
                    <legend className="mb-1">{t("timeWindow")}</legend>
                    <label className="flex items-center gap-1">
                      {t("from")} <input type="time" name="from" defaultValue={c.timeWindow?.from ?? ""} className={input + " w-32"} />
                    </label>
                    <label className="flex items-center gap-1">
                      {t("to")} <input type="time" name="to" defaultValue={c.timeWindow?.to ?? ""} className={input + " w-32"} />
                    </label>
                    <span className="text-muted-foreground">{t("timeWindowHint")}</span>
                  </fieldset>
                  <Button type="submit" className="sm:col-span-3 sm:justify-self-start">
                    {t("saveCategory")}
                  </Button>
                </form>
              </details>
            )}

            {catItems.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">{t("emptyCategory")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {catItems.map((item, ii) => {
                  const itemVariants = variants.filter((v) => v.itemId === item.id);
                  const soldOut = item.soldOutUntil !== null && item.soldOutUntil.getTime() > now;
                  const price =
                    itemVariants.length > 0
                      ? itemVariants.map((v) => formatFCFA(v.price)).join(" / ")
                      : (formatFCFA(item.price) ?? t("onRequest"));
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 p-3" data-testid="admin-item">
                      {item.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small, already-compressed thumbnail
                        <img src={item.thumbUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 rounded-lg object-cover" />
                      ) : (
                        <span className="h-14 w-14 rounded-lg bg-muted" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {item.code && <span className="mr-1 text-muted-foreground">{item.code}.</span>}
                          {pickText(item.name, locale)}
                        </p>
                        <p className="text-sm text-muted-foreground tabular-nums">{price}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {soldOut && <Badge variant="danger">{t("soldOutToday")}</Badge>}
                          {!item.available && <Badge variant="muted">{t("hidden")}</Badge>}
                        </div>
                        {soldOut && item.unavailableNote && <p className="mt-1 text-xs text-red-800 italic">« {item.unavailableNote} »</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <form action={soldOutAction} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="soldOut" value={soldOut ? "0" : "1"} />
                          {!soldOut && (
                            <input
                              name="note"
                              maxLength={80}
                              placeholder={t("soldOutNotePlaceholder")}
                              aria-label={`${t("soldOutNoteLabel")} · ${pickText(item.name, locale)}`}
                              className="min-h-11 w-40 rounded-lg border border-border bg-surface px-2 text-base"
                              data-testid="sold-out-note-input"
                            />
                          )}
                          <button className={btn} title={t("soldOutHint")}>
                            {soldOut ? t("backInStock") : t("markSoldOut")}
                          </button>
                        </form>
                        {canWrite && (
                          <>
                            <form action={availableAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input type="hidden" name="available" value={item.available ? "0" : "1"} />
                              <button className={btn}>{item.available ? t("hide") : t("show")}</button>
                            </form>
                            <form action={moveItemAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <button name="dir" value="up" className={btn} aria-label={t("moveUp")} disabled={ii === 0}>
                                ↑
                              </button>
                              <button name="dir" value="down" className={btn} aria-label={t("moveDown")} disabled={ii === catItems.length - 1}>
                                ↓
                              </button>
                            </form>
                            <form action={duplicateItemAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <button className={btn}>{t("duplicate")}</button>
                            </form>
                            <Link href={`/app/menu/items/${item.id}`} className={btn + " flex items-center text-primary"}>
                              {t("edit")}
                            </Link>
                            <form action={deleteItemAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <ConfirmButton message={t("confirmDelete")}>{t("delete")}</ConfirmButton>
                            </form>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {canWrite && (
              <div className="border-t border-border p-3">
                <Button asChild variant="outline">
                  <Link href={`/app/menu/items/new?category=${c.id}`}>+ {t("addItem")}</Link>
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {canWrite && (
        <Card>
          <h2 className="mb-3 text-lg font-bold">{t("addCategory")}</h2>
          <form action={createCategoryAction} className="grid gap-2 sm:grid-cols-3">
            <label className="sm:col-span-3">
              <span className="mb-1 block text-sm font-semibold">{t("categoryName")}</span>
              <input name="name_fr" required maxLength={120} placeholder={t("categoryNamePlaceholder")} className={input} />
            </label>
            <input name="name_en" placeholder="EN" aria-label="EN" className={input} />
            <input name="name_zh" placeholder="中文" aria-label="ZH" className={input} />
            <Button type="submit">{t("addCategory")}</Button>
          </form>
        </Card>
      )}
    </div>
  );
}

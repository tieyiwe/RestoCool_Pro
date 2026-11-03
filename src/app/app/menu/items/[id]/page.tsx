import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { ItemForm } from "@/components/menu-admin/item-form";
import { requireMemberPage } from "@/lib/auth/page";
import { pickText } from "@/i18n/config";
import { ITEM_TAGS, STATIONS, type ItemFormValues } from "@/lib/menu/schemas";

const tri = (t: { fr: string; en?: string; zh?: string } | null | undefined) => ({ fr: t?.fr ?? "", en: t?.en ?? "", zh: t?.zh ?? "" });

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMemberPage("menu.write");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const item = await ctx.repo.menu.item(id); // tenant-scoped: another restaurant's id is a 404
  if (!item) notFound();
  const t = await getTranslations("menuAdmin.item");
  const locale = await getLocale();
  const [categories, variants, options] = await Promise.all([ctx.repo.menu.categories(), ctx.repo.menu.variants(), ctx.repo.menu.options()]);

  const values: ItemFormValues = {
    categoryId: item.categoryId,
    code: item.code ?? "",
    name: tri(item.name),
    description: tri(item.description),
    price: item.price,
    variants: variants.filter((v) => v.itemId === id).map((v) => ({ name: tri(v.name), price: v.price })),
    options: options.filter((o) => o.itemId === id).map((o) => ({ group: tri(o.group), name: tri(o.name), priceDelta: o.priceDelta })),
    spicy: item.spicy,
    tags: item.tags.filter((x): x is (typeof ITEM_TAGS)[number] => (ITEM_TAGS as readonly string[]).includes(x)),
    station: (STATIONS as readonly string[]).includes(item.station) ? (item.station as (typeof STATIONS)[number]) : "kitchen",
    photoUrl: item.photoUrl,
    thumbUrl: item.thumbUrl,
    available: item.available,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-extrabold">{t("editTitle")}</h1>
      <ItemForm itemId={id} categories={categories.map((c) => ({ id: c.id, name: pickText(c.name, locale) }))} defaultValues={values} />
    </div>
  );
}

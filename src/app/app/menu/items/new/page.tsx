import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ItemForm } from "@/components/menu-admin/item-form";
import { requireMemberPage } from "@/lib/auth/page";
import { pickText } from "@/i18n/config";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const ctx = await requireMemberPage("menu.write");
  const t = await getTranslations("menuAdmin.item");
  const locale = await getLocale();
  const categories = await ctx.repo.menu.categories();
  if (categories.length === 0) redirect("/app/menu");
  const { category } = await searchParams;
  const categoryId = categories.find((c) => c.id === category)?.id ?? categories[0]!.id;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-extrabold">{t("newTitle")}</h1>
      <ItemForm
        categories={categories.map((c) => ({ id: c.id, name: pickText(c.name, locale) }))}
        defaultValues={{
          categoryId,
          code: "",
          name: { fr: "", en: "", zh: "" },
          description: { fr: "", en: "", zh: "" },
          price: null,
          variants: [],
          options: [],
          spicy: 0,
          tags: [],
          station: "kitchen",
          photoUrl: null,
          thumbUrl: null,
          available: true,
        }}
      />
    </div>
  );
}

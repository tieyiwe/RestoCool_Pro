import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { CreateRestaurantForm } from "./create-restaurant-form";

export default async function NewRestaurantPage() {
  const t = await getTranslations("app.newRestaurant");
  return (
    <Card className="mx-auto w-full max-w-md p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{t("title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("intro")}</p>
      <CreateRestaurantForm />
    </Card>
  );
}

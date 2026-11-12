/** "Chez Fatou — Ouaga 2000" → "chez-fatou-ouaga-2000" */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "restaurant";
}

/** Addresses no business may take: app routes, the brand, and the demo businesses (the seed recreates those). */
export const RESERVED_SLUGS = new Set(["app", "admin", "api", "r", "c", "www", "restocool", "tiblogics", "demo", "new", "restaurant-demo", "express-demo", "maquis-temoin", "restaurants", "guide", "privacy", "terms", "poste", "pointage", "rejoindre", "sign-in", "sign-up"]);

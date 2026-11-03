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

export const RESERVED_SLUGS = new Set(["app", "admin", "api", "r", "www", "restocool", "tiblogics", "demo", "new"]);

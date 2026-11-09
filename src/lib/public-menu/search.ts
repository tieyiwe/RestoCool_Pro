import type { PublicItem } from "./types";

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Matches the query against the dish number, names and descriptions in all three languages. */
export function itemMatches(item: PublicItem, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const hay = [item.code ?? "", ...Object.values(item.name), ...Object.values(item.description ?? {})].map((v) => normalize(String(v ?? "")));
  return hay.some((h) => h.includes(q));
}

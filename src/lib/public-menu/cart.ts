import { formatFCFA } from "@/lib/format";
import type { CartLine, PublicItem, PublicMenuData } from "./types";

export function lineKey(itemId: string, variantId: string | null, optionIds: string[]): string {
  return [itemId, variantId ?? "-", ...[...optionIds].sort()].join("|");
}

export function indexItems(data: PublicMenuData): Map<string, PublicItem> {
  const m = new Map<string, PublicItem>();
  for (const c of data.categories) for (const i of c.items) m.set(i.id, i);
  return m;
}

/** Unit price of a line, or null when the dish is « sur demande ». */
export function unitPrice(item: PublicItem, variantId: string | null, optionIds: string[]): number | null {
  const base = variantId ? (item.variants.find((v) => v.id === variantId)?.price ?? null) : item.price;
  if (base === null) return null;
  const extras = item.options.filter((o) => optionIds.includes(o.id)).reduce((s, o) => s + o.priceDelta, 0);
  return base + extras;
}

/**
 * A saved line still matches the current menu: the dish exists, its variant (required when the
 * dish has variants) and options still exist. Variants are re-created on every edit, so an old
 * variant id would otherwise be priced as « sur demande ».
 */
export function lineMatchesMenu(items: Map<string, PublicItem>, line: CartLine): boolean {
  const item = items.get(line.itemId);
  if (!item) return false;
  if (item.variants.length > 0 ? !item.variants.some((v) => v.id === line.variantId) : line.variantId !== null) return false;
  return line.optionIds.every((id) => item.options.some((o) => o.id === id));
}

export type CartTotals = { count: number; total: number; hasOnRequest: boolean };

/** Lines whose dish no longer exists (menu changed) are ignored. */
export function cartTotals(items: Map<string, PublicItem>, lines: CartLine[]): CartTotals {
  let count = 0;
  let total = 0;
  let hasOnRequest = false;
  for (const l of lines) {
    const item = items.get(l.itemId);
    if (!item) continue;
    count += l.qty;
    const p = unitPrice(item, l.variantId, l.optionIds);
    if (p === null) hasOnRequest = true;
    else total += p * l.qty;
  }
  return { count, total, hasOnRequest };
}

/** Add one (or create the line). */
export function addToCart(lines: CartLine[], itemId: string, variantId: string | null = null, optionIds: string[] = []): CartLine[] {
  const key = lineKey(itemId, variantId, optionIds);
  const found = lines.find((l) => l.key === key);
  if (found) return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
  return [...lines, { key, itemId, variantId, optionIds: [...optionIds].sort(), qty: 1 }];
}

export function changeQty(lines: CartLine[], key: string, delta: number): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + delta) } : l)).filter((l) => l.qty > 0);
}

export function qtyForItem(lines: CartLine[], itemId: string): number {
  return lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);
}

/** Prefilled French message for a takeaway order on WhatsApp (staff read French). */
export function takeawayMessage(
  data: Pick<PublicMenuData, "name">,
  items: Map<string, PublicItem>,
  lines: CartLine[],
  customer: { name: string; pickup: string },
): string {
  const rows: string[] = [];
  for (const l of lines) {
    const item = items.get(l.itemId);
    if (!item) continue;
    const variant = l.variantId ? item.variants.find((v) => v.id === l.variantId) : null;
    const opts = item.options.filter((o) => l.optionIds.includes(o.id)).map((o) => o.name.fr);
    const detail = [variant?.name.fr, ...opts].filter(Boolean).join(", ");
    const p = unitPrice(item, l.variantId, l.optionIds);
    const price = p === null ? "sur demande" : formatFCFA(p * l.qty);
    rows.push(`- ${l.qty} × ${item.code ? `${item.code}. ` : ""}${item.name.fr}${detail ? ` (${detail})` : ""} : ${price}`);
  }
  const t = cartTotals(items, lines);
  return [
    `Bonjour ${data.name}, je souhaite commander à emporter :`,
    ...rows,
    `Total : ${formatFCFA(t.total)}${t.hasOnRequest ? " + articles sur demande" : ""}`,
    `Nom : ${customer.name}`,
    customer.pickup ? `Retrait vers : ${customer.pickup}` : null,
    "(Envoyé depuis le menu RestoCool)",
  ]
    .filter(Boolean)
    .join("\n");
}

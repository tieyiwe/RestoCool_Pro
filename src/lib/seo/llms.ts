import "server-only";
import { LANDING_FEATURES } from "@/config/marketing";
import { PLANS, TRIAL_DAYS, type PlanId } from "@/config/plans";
import { formatRc } from "@/lib/access-codes";
import { plainFCFA } from "./json-ld";
import type { PublicMenuData } from "@/lib/public-menu/types";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * /llms.txt and /llms-full.txt (https://llmstxt.org): what RestoCool is, for AI assistants.
 * Built from the same texts as the home page (src/messages), so it never says more than the site.
 * English first (most assistants), with the French originals where they matter.
 */
export type LlmsBusiness = { slug: string; name: string; kind: "restaurant" | "transport"; city: string; description: unknown; rc: string | null };

const L = en.landing;
const FEATURES = LANDING_FEATURES.map((f) => [f.key, f.ready] as const);
const PLAN_IDS: PlanId[] = ["gratuit", "pro", "business"];
const FAQ = [1, 2, 3, 4, 5, 6] as const;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const md = (s: string) => oneLine(s).replace(/([\\`*_[\]<>])/g, "\\$1");
const frText = (d: unknown) => (d && typeof d === "object" && "fr" in d && typeof (d as { fr: unknown }).fr === "string" ? oneLine((d as { fr: string }).fr) : "");

function businessLine(base: string, b: LlmsBusiness) {
  const desc = frText(b.description);
  const rc = b.rc ? ` · ${formatRc(b.rc)}` : "";
  return `- [${md(b.name)}](${base}/r/${b.slug}): ${md(b.city)}${rc}${desc ? ` — ${md(desc)}` : ""} ([menu JSON](${base}/r/${b.slug}/menu.json))`;
}

export function llmsTxt(base: string, businesses: LlmsBusiness[], opts: { full?: boolean; menus?: Map<string, PublicMenuData> } = {}): string {
  const out: string[] = [];
  out.push("# RestoCool", "");
  out.push(`> ${oneLine(L.hero.subtitle)}`, "");
  out.push(
    `RestoCool (« ${oneLine(fr.brand.tagline)} ») is a web platform by TIBLOGICS for ${oneLine(L.hero.eyebrow).replace(/^For /, "")}: ` +
      "a digital menu opened by QR code, ordering from the customer's phone, and dining-room management for the staff. " +
      "Customers need no app and no account. Languages: French (default), English, Chinese. Prices in CFA francs (FCFA, XOF), written « 5 300 F ». " +
      "It also serves VIP bus companies that sell meals on board (travellers order from their seat).",
    "",
  );
  out.push(`- ${oneLine(en.brand.designedIn)} · ${oneLine(en.brand.proud)}`, `- ${oneLine(en.brand.payLocal)}`, `- ${oneLine(en.brand.support)}`, "");

  out.push("## Find a business", "");
  out.push(
    `- [Directory](${base}/restaurants): every published business; search by name, town or RC number (${base}/restaurants?q=ouagadougou).`,
    `- Menu of a business: ${base}/r/{slug} (server-rendered HTML with schema.org Restaurant/Menu JSON-LD), and ${base}/r/{slug}/menu.json (same facts as JSON).`,
    `- RC number (« numéro RC »): the code printed under a business's QR code, e.g. RC-K7M3P. Open ${base}/c/{CODE} or type it at ${base}/c.`,
    `- [All businesses as JSON](${base}/restaurants.json)`,
    "",
  );

  out.push("## Features", "");
  for (const [k, ready] of FEATURES) out.push(`- ${md(L.features[k].title)}${ready ? "" : ` (${L.features.soon.toLowerCase()})`}: ${md(L.features[k].text)}`);
  out.push("");

  out.push("## Pricing (per month, FCFA)", "");
  for (const id of PLAN_IDS) {
    const p = L.pricing[id];
    const price = PLANS[id].priceMonthly;
    const feats = (["f1", "f2", "f3", "f4", "f5"] as const).map((f) => md(p[f])).join("; ");
    out.push(`- ${p.name}: ${price ? `${plainFCFA(price)} ${L.pricing.month}` : L.pricing.free} — ${md(p.desc)} ${feats}.`);
  }
  out.push(`- ${md(L.pricing.note)} New businesses start with a ${TRIAL_DAYS}-day Pro trial with no payment.`, "");

  out.push("## Pages", "");
  out.push(
    `- [Home](${base}/): presentation, features, pricing, FAQ`,
    `- [Directory](${base}/restaurants)`,
    `- [Guide](${base}/guide): animated tutorials for managers and staff`,
    `- [Demo](${base}/demo): animated demo of a menu and orders`,
    `- [Privacy policy](${base}/privacy) · [Terms](${base}/terms)`,
    "",
  );

  out.push("## Businesses on RestoCool", "");
  if (businesses.length) for (const b of businesses) out.push(businessLine(base, b));
  else out.push("- None published yet.");
  out.push("");

  if (opts.full) {
    out.push("## FAQ", "");
    for (const n of FAQ) out.push(`### ${md(L.faq[`q${n}`])}`, "", md(L.faq[`a${n}`]), "");
    out.push("## FAQ (français)", "");
    for (const n of FAQ) out.push(`### ${md(fr.landing.faq[`q${n}`])}`, "", md(fr.landing.faq[`a${n}`]), "");
    for (const b of businesses) {
      const menu = opts.menus?.get(b.slug);
      if (!menu) continue;
      out.push(`## Menu: ${md(b.name)} (${md(b.city)})`, "", `Source: ${base}/r/${b.slug} · prices in FCFA · « sur demande » = price on request.`, "");
      for (const c of menu.categories) {
        out.push(`### ${md(c.name.fr)}`, "");
        for (const i of c.items) {
          const price = i.variants.length ? i.variants.map((v) => `${md(v.name.fr)} ${plainFCFA(v.price)}`).join(" / ") : (plainFCFA(i.price) ?? "sur demande");
          const alt = [i.name.en, i.name.zh].filter((x): x is string => Boolean(x?.trim()) && x !== i.name.fr).map(md);
          out.push(`- ${i.code ? `${md(i.code)}. ` : ""}${md(i.name.fr)}${alt.length ? ` (${alt.join(" · ")})` : ""}: ${price}${i.soldOut ? " — sold out today" : ""}`);
        }
        out.push("");
      }
    }
  }
  return out.join("\n");
}

/**
 * Built-in FR → EN / ZH glossary for the « Suggérer » button (no paid AI in v1).
 * Phrases are tried first, then word by word. A Chinese suggestion is only given
 * when every word is known (mixing languages reads badly); English keeps unknown words.
 */
type Entry = { en: string; zh: string };

const PHRASES: Record<string, Entry> = {
  "riz gras": { en: "Jollof-style rice", zh: "油焖饭" },
  "poulet bicyclette": { en: "Free-range chicken", zh: "走地鸡" },
  "poulet braisé": { en: "Grilled chicken", zh: "烤鸡" },
  "poisson braisé": { en: "Grilled fish", zh: "烤鱼" },
  "jus de bissap": { en: "Hibiscus juice", zh: "洛神花汁" },
  "jus de gingembre": { en: "Ginger juice", zh: "姜汁" },
  "jus de tamarin": { en: "Tamarind juice", zh: "罗望子汁" },
  "jus de fruits": { en: "Fruit juice", zh: "果汁" },
  "sauce arachide": { en: "Peanut sauce", zh: "花生酱" },
  "sauce gombo": { en: "Okra sauce", zh: "秋葵酱" },
  "sauce feuilles": { en: "Leaf sauce", zh: "叶子酱" },
  "tô": { en: "Millet tô", zh: "小米糊" },
  "attiéké": { en: "Attiéké (cassava couscous)", zh: "木薯粒" },
  "alloco": { en: "Fried plantain", zh: "炸芭蕉" },
  "dégué": { en: "Dégué (millet and yogurt)", zh: "小米酸奶" },
  "babenda": { en: "Babenda (leafy greens stew)", zh: "巴本达" },
  "salade de fruits": { en: "Fruit salad", zh: "水果沙拉" },
  "eau minérale": { en: "Mineral water", zh: "矿泉水" },
  "plat du jour": { en: "Dish of the day", zh: "每日特色菜" },
  "à emporter": { en: "Takeaway", zh: "外带" },
  "demi-portion": { en: "Half portion", zh: "半份" },
  "portion complète": { en: "Full portion", zh: "整份" },
  "entier": { en: "Whole", zh: "整只" },
  "demi": { en: "Half", zh: "半份" },
  "bouteille": { en: "Bottle", zh: "瓶装" },
  "verre": { en: "Glass", zh: "杯" },
};

const WORDS: Record<string, Entry> = {
  poulet: { en: "chicken", zh: "鸡" },
  pintade: { en: "guinea fowl", zh: "珍珠鸡" },
  boeuf: { en: "beef", zh: "牛肉" },
  bœuf: { en: "beef", zh: "牛肉" },
  mouton: { en: "mutton", zh: "羊肉" },
  agneau: { en: "lamb", zh: "羊羔肉" },
  chèvre: { en: "goat", zh: "山羊肉" },
  porc: { en: "pork", zh: "猪肉" },
  poisson: { en: "fish", zh: "鱼" },
  capitaine: { en: "Nile perch", zh: "尼罗河鲈鱼" },
  carpe: { en: "carp", zh: "鲤鱼" },
  crevettes: { en: "shrimp", zh: "虾" },
  foie: { en: "liver", zh: "肝" },
  oeufs: { en: "eggs", zh: "蛋" },
  œufs: { en: "eggs", zh: "蛋" },
  riz: { en: "rice", zh: "米饭" },
  frites: { en: "fries", zh: "薯条" },
  igname: { en: "yam", zh: "山药" },
  banane: { en: "banana", zh: "香蕉" },
  plantain: { en: "plantain", zh: "芭蕉" },
  haricots: { en: "beans", zh: "豆子" },
  spaghetti: { en: "spaghetti", zh: "意面" },
  salade: { en: "salad", zh: "沙拉" },
  soupe: { en: "soup", zh: "汤" },
  sauce: { en: "sauce", zh: "酱" },
  brochettes: { en: "skewers", zh: "串" },
  brochette: { en: "skewer", zh: "串" },
  grillé: { en: "grilled", zh: "烤" },
  grillée: { en: "grilled", zh: "烤" },
  grillés: { en: "grilled", zh: "烤" },
  braisé: { en: "grilled", zh: "烤" },
  braisée: { en: "grilled", zh: "烤" },
  frit: { en: "fried", zh: "炸" },
  frite: { en: "fried", zh: "炸" },
  sauté: { en: "stir-fried", zh: "炒" },
  sautés: { en: "stir-fried", zh: "炒" },
  four: { en: "oven-roasted", zh: "烤" },
  jus: { en: "juice", zh: "汁" },
  bière: { en: "beer", zh: "啤酒" },
  eau: { en: "water", zh: "水" },
  café: { en: "coffee", zh: "咖啡" },
  thé: { en: "tea", zh: "茶" },
  lait: { en: "milk", zh: "牛奶" },
  gâteau: { en: "cake", zh: "蛋糕" },
  glace: { en: "ice cream", zh: "冰淇淋" },
  chocolat: { en: "chocolate", zh: "巧克力" },
  fruits: { en: "fruit", zh: "水果" },
  avocat: { en: "avocado", zh: "牛油果" },
  mangue: { en: "mango", zh: "芒果" },
  arachide: { en: "peanut", zh: "花生" },
  gombo: { en: "okra", zh: "秋葵" },
  oignons: { en: "onions", zh: "洋葱" },
  piment: { en: "chili", zh: "辣椒" },
  "sans": { en: "without", zh: "不加" },
  "avec": { en: "with", zh: "配" },
  maison: { en: "house", zh: "自制" },
  local: { en: "local", zh: "本地" },
  locale: { en: "local", zh: "本地" },
  frais: { en: "fresh", zh: "新鲜" },
  fraîche: { en: "fresh", zh: "新鲜" },
};

/** French connecting words dropped in Chinese and simplified in English. */
const STOP = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "au", "aux", "à", "et", "en"]);

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();

export type Suggestion = { en: string; zh: string };

export function suggestTranslation(fr: string): Suggestion {
  const n = norm(fr);
  if (!n) return { en: "", zh: "" };
  const phrase = PHRASES[n];
  if (phrase) return { ...phrase };

  // Greedy: longest known phrase at each position, else a word.
  const tokens = n.split(" ");
  const en: string[] = [];
  const zh: string[] = [];
  let zhComplete = true;
  for (let i = 0; i < tokens.length; ) {
    let matched = false;
    for (let len = Math.min(4, tokens.length - i); len >= 2; len--) {
      const p = PHRASES[tokens.slice(i, i + len).join(" ")];
      if (p) {
        en.push(p.en);
        zh.push(p.zh);
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const word = tokens[i]!;
    const entry = WORDS[word] ?? PHRASES[word];
    if (entry) {
      en.push(entry.en);
      zh.push(entry.zh);
    } else if (STOP.has(word)) {
      // skip
    } else if (/^\d+([.,]\d+)?(cl|l|g|kg)?$/.test(word)) {
      en.push(word);
      zh.push(word);
    } else {
      en.push(word);
      zhComplete = false;
    }
    i++;
  }
  const enText = en.join(" ");
  return { en: enText.charAt(0).toUpperCase() + enText.slice(1), zh: zhComplete ? zh.join("") : "" };
}

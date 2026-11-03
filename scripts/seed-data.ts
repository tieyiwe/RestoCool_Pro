/**
 * Fictional demo restaurant. Every name, dish, number and description here is invented.
 * Phone numbers use the reserved-looking 70 00 00 0x pattern.
 */
import type { I18nText } from "../src/db/schema";

type Station = "grill" | "wok" | "kitchen" | "drinks" | "desserts";
export type SeedItem = {
  code: string;
  name: I18nText;
  description?: I18nText;
  price: number | null;
  spicy?: 0 | 1 | 2;
  tags?: string[];
  station?: Station;
  variants?: Array<{ name: I18nText; price: number }>;
  options?: Array<{ group: I18nText; name: I18nText; priceDelta: number; maxSelect?: number }>;
};
export type SeedCategory = { name: I18nText; color: string; station: Station; items: SeedItem[] };

const piment = { group: { fr: "Piment", en: "Chili", zh: "辣椒" }, maxSelect: 1 } as const;

export const DEMO_CATEGORIES: SeedCategory[] = [
  {
    name: { fr: "Entrées", en: "Starters", zh: "前菜" },
    color: "#b45309",
    station: "kitchen",
    items: [
      { code: "1", name: { fr: "Salade composée", en: "Mixed salad", zh: "什锦沙拉" }, price: 2500, tags: ["vegetarian"] },
      { code: "2", name: { fr: "Salade d’avocat", en: "Avocado salad", zh: "牛油果沙拉" }, price: 2000, tags: ["vegetarian", "local"] },
      { code: "3", name: { fr: "Soupe de poisson", en: "Fish soup", zh: "鱼汤" }, price: 3000, spicy: 1 },
      { code: "4", name: { fr: "Beignets de haricots", en: "Bean fritters", zh: "豆子炸饼" }, price: 1000, tags: ["vegetarian", "local"] },
      { code: "5", name: { fr: "Pastels à la viande", en: "Meat pastries", zh: "肉馅酥饼" }, price: 1500, spicy: 1, tags: ["new"] },
      { code: "6", name: { fr: "Œufs mimosa", en: "Deviled eggs", zh: "魔鬼蛋" }, price: 1500, tags: ["eggs"] },
    ],
  },
  {
    name: { fr: "Grillades", en: "Grills", zh: "烧烤" },
    color: "#b91c1c",
    station: "grill",
    items: [
      {
        code: "10",
        name: { fr: "Poulet bicyclette braisé", en: "Grilled free-range chicken", zh: "烤走地鸡" },
        description: { fr: "Poulet local mariné, braisé au feu de bois.", en: "Local chicken, marinated and wood-grilled.", zh: "本地鸡腌制后柴火烤制。" },
        price: null,
        spicy: 1,
        tags: ["local", "chef"],
        variants: [
          { name: { fr: "Demi", en: "Half", zh: "半只" }, price: 3500 },
          { name: { fr: "Entier", en: "Whole", zh: "整只" }, price: 6500 },
        ],
      },
      {
        code: "11",
        name: { fr: "Brochettes de bœuf", en: "Beef skewers", zh: "牛肉串" },
        price: 2000,
        spicy: 1,
        options: [
          { ...piment, name: { fr: "Sans piment", en: "No chili", zh: "不辣" }, priceDelta: 0 },
          { ...piment, name: { fr: "Piment à part", en: "Chili on the side", zh: "辣椒另放" }, priceDelta: 0 },
        ],
      },
      { code: "12", name: { fr: "Brochettes de foie", en: "Liver skewers", zh: "肝串" }, price: 1500, spicy: 1 },
      {
        code: "13",
        name: { fr: "Poisson braisé (capitaine)", en: "Grilled Nile perch", zh: "烤尼罗河鲈鱼" },
        description: { fr: "Prix selon le poids, demandez au serveur.", en: "Price by weight, ask your server.", zh: "按重量计价，请咨询服务员。" },
        price: null,
        spicy: 2,
      },
      { code: "14", name: { fr: "Pintade grillée", en: "Grilled guinea fowl", zh: "烤珍珠鸡" }, price: 7000, spicy: 1, tags: ["local"] },
      { code: "15", name: { fr: "Côtelettes d’agneau", en: "Lamb chops", zh: "羊排" }, price: 6000 },
      { code: "16", name: { fr: "Porc au four", en: "Oven-roasted pork", zh: "烤猪肉" }, price: 4000, spicy: 2, tags: ["new"] },
      { code: "17", name: { fr: "Saucisses grillées", en: "Grilled sausages", zh: "烤香肠" }, price: 2500 },
    ],
  },
  {
    name: { fr: "Plats", en: "Main dishes", zh: "主菜" },
    color: "#0f6b3e",
    station: "kitchen",
    items: [
      {
        code: "20",
        name: { fr: "Riz gras", en: "Jollof-style rice", zh: "油焖饭" },
        price: null,
        spicy: 1,
        tags: ["local", "chef"],
        variants: [
          { name: { fr: "Demi-portion", en: "Half portion", zh: "半份" }, price: 1500 },
          { name: { fr: "Portion complète", en: "Full portion", zh: "整份" }, price: 2500 },
        ],
      },
      { code: "21", name: { fr: "Tô sauce gombo", en: "Millet tô with okra sauce", zh: "小米糊配秋葵酱" }, price: 1500, tags: ["local"] },
      { code: "22", name: { fr: "Tô sauce feuilles", en: "Millet tô with leaf sauce", zh: "小米糊配叶子酱" }, price: 1500, spicy: 1, tags: ["local"] },
      { code: "23", name: { fr: "Riz sauce arachide", en: "Rice with peanut sauce", zh: "米饭配花生酱" }, price: 2000, tags: ["local", "peanuts"] },
      { code: "24", name: { fr: "Attiéké poisson", en: "Attiéké with fish", zh: "木薯粒配鱼" }, price: 3000, spicy: 1 },
      { code: "25", name: { fr: "Babenda", en: "Babenda (leafy greens stew)", zh: "巴本达（青菜炖菜）" }, price: 2000, tags: ["local", "new"] },
      { code: "26", name: { fr: "Ragoût d’igname", en: "Yam stew", zh: "山药炖肉" }, price: 2500 },
      { code: "27", name: { fr: "Spaghetti sautés", en: "Stir-fried spaghetti", zh: "炒意面" }, price: 2000, station: "wok" },
    ],
  },
  {
    name: { fr: "Accompagnements", en: "Sides", zh: "配菜" },
    color: "#a16207",
    station: "kitchen",
    items: [
      { code: "30", name: { fr: "Alloco", en: "Fried plantain", zh: "炸芭蕉" }, price: 1000, tags: ["vegetarian"] },
      { code: "31", name: { fr: "Frites", en: "French fries", zh: "薯条" }, price: 1000, tags: ["vegetarian"] },
      { code: "32", name: { fr: "Attiéké", en: "Attiéké (cassava couscous)", zh: "木薯粒" }, price: 500, tags: ["vegetarian"] },
      { code: "33", name: { fr: "Riz blanc", en: "White rice", zh: "白米饭" }, price: 500, tags: ["vegetarian"] },
      { code: "34", name: { fr: "Igname frite", en: "Fried yam", zh: "炸山药" }, price: 1000, tags: ["vegetarian"] },
    ],
  },
  {
    name: { fr: "Boissons", en: "Drinks", zh: "饮料" },
    color: "#7c3aed",
    station: "drinks",
    items: [
      { code: "40", name: { fr: "Jus de bissap", en: "Hibiscus juice (bissap)", zh: "洛神花汁" }, price: 500, tags: ["local"] },
      { code: "41", name: { fr: "Jus de gingembre", en: "Ginger juice", zh: "姜汁" }, price: 500, spicy: 1, tags: ["local"] },
      { code: "42", name: { fr: "Jus de tamarin", en: "Tamarind juice", zh: "罗望子汁" }, price: 500, tags: ["local"] },
      { code: "43", name: { fr: "Eau minérale 1,5 L", en: "Mineral water 1.5 L", zh: "矿泉水 1.5升" }, price: 600 },
      { code: "44", name: { fr: "Soda (33 cl)", en: "Soda (33 cl)", zh: "汽水（33毫升）" }, price: 700 },
      { code: "45", name: { fr: "Bière blonde (65 cl)", en: "Lager beer (65 cl)", zh: "啤酒（65毫升）" }, price: 1000 },
      {
        code: "46",
        name: { fr: "Champagne", en: "Champagne", zh: "香槟" },
        price: null,
        variants: [
          { name: { fr: "Bouteille 75 cl", en: "75 cl bottle", zh: "75毫升瓶装" }, price: 48000 },
          { name: { fr: "Magnum 1,5 L", en: "1.5 L magnum", zh: "1.5升大瓶" }, price: 78000 },
        ],
      },
      { code: "47", name: { fr: "Café ou thé", en: "Coffee or tea", zh: "咖啡或茶" }, price: 500 },
    ],
  },
  {
    name: { fr: "Desserts", en: "Desserts", zh: "甜点" },
    color: "#db2777",
    station: "desserts",
    items: [
      { code: "50", name: { fr: "Dégué", en: "Dégué (millet & yogurt)", zh: "小米酸奶甜品" }, price: 1000, tags: ["local"] },
      { code: "51", name: { fr: "Salade de fruits", en: "Fruit salad", zh: "水果沙拉" }, price: 1500, tags: ["vegetarian"] },
      { code: "52", name: { fr: "Banane flambée", en: "Flambéed banana", zh: "火焰香蕉" }, price: 2000, tags: ["new"] },
      { code: "53", name: { fr: "Gâteau au chocolat", en: "Chocolate cake", zh: "巧克力蛋糕" }, price: 2000, tags: ["eggs"] },
      { code: "54", name: { fr: "Glace (2 boules)", en: "Ice cream (2 scoops)", zh: "冰淇淋（两球）" }, price: 1500 },
    ],
  },
];

export const DEMO_FORTUNES: I18nText[] = [
  { fr: "Une bonne nouvelle arrive avant la fin de la semaine.", en: "Good news will arrive before the end of the week.", zh: "本周结束前会有好消息。" },
  { fr: "Le partage d’un repas double le bonheur.", en: "Sharing a meal doubles the happiness.", zh: "分享一顿饭，幸福加倍。" },
  { fr: "Votre patience sera bientôt récompensée.", en: "Your patience will soon be rewarded.", zh: "你的耐心很快会得到回报。" },
  { fr: "Un ami vous rendra un grand service.", en: "A friend will do you a great favour.", zh: "一位朋友会帮你一个大忙。" },
  { fr: "Osez ce projet dont vous rêvez.", en: "Dare to start the project you dream of.", zh: "勇敢开始你梦想的计划吧。" },
  { fr: "La chance sourit à ceux qui sourient.", en: "Luck smiles on those who smile.", zh: "好运眷顾爱笑的人。" },
  { fr: "Un voyage agréable se prépare.", en: "A pleasant journey is on its way.", zh: "一段愉快的旅程即将开始。" },
  { fr: "Votre gentillesse vous ouvrira des portes.", en: "Your kindness will open doors for you.", zh: "你的善良会为你打开大门。" },
  { fr: "Aujourd’hui est un bon jour pour apprendre.", en: "Today is a good day to learn something.", zh: "今天是学习的好日子。" },
  { fr: "Une rencontre inattendue vous fera rire.", en: "An unexpected meeting will make you laugh.", zh: "一次意外的相遇会让你开怀大笑。" },
  { fr: "Le travail bien fait finit toujours par payer.", en: "Work done well always pays off in the end.", zh: "认真做事终会有回报。" },
  { fr: "Votre famille est votre plus grande richesse.", en: "Your family is your greatest wealth.", zh: "家人是你最大的财富。" },
  { fr: "Petit à petit, l’oiseau fait son nid.", en: "Little by little, the bird builds its nest.", zh: "积少成多，循序渐进。" },
  { fr: "Un repas savoureux annonce une belle soirée.", en: "A tasty meal promises a lovely evening.", zh: "美味的一餐预示着美好的夜晚。" },
  { fr: "Faites confiance à votre intuition.", en: "Trust your intuition.", zh: "相信你的直觉。" },
  { fr: "Une idée simple changera votre semaine.", en: "A simple idea will change your week.", zh: "一个简单的想法会改变你的一周。" },
  { fr: "Le rire est le meilleur des desserts.", en: "Laughter is the best dessert.", zh: "笑声是最好的甜点。" },
  { fr: "Vos efforts d’aujourd’hui sont les fruits de demain.", en: "Today's efforts are tomorrow's fruit.", zh: "今天的努力就是明天的果实。" },
  { fr: "Quelqu’un pense à vous en ce moment.", en: "Someone is thinking of you right now.", zh: "此刻有人正在想念你。" },
  { fr: "La générosité revient toujours vers vous.", en: "Generosity always comes back to you.", zh: "慷慨终会回到你身边。" },
  { fr: "Un nouveau départ vous attend.", en: "A fresh start is waiting for you.", zh: "新的开始正在等着你。" },
  { fr: "Prenez le temps de savourer chaque instant.", en: "Take time to savour every moment.", zh: "花时间品味每一刻。" },
  { fr: "Votre sourire illumine la table.", en: "Your smile lights up the table.", zh: "你的笑容照亮了整张桌子。" },
  { fr: "Ce soir, la chance est à votre table.", en: "Tonight, luck is at your table.", zh: "今晚，好运就在你的餐桌上。" },
];

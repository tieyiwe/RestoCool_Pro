/**
 * Creates the real Shangri-La restaurant (Ouaga 2000) from its existing menu site
 * (github.com/tieyiwe/shangri-la-menu, copied in imports/shangri-la): 16 categories, ~286 dishes
 * and drinks in FR/EN/ZH with prices, spice levels, « nouveau » tags, the Champagne's two prices,
 * 78 photos, contacts, 19 tables and 12 private rooms.
 *
 *   npm run import:shangri-la -- --owner-email=owner@example.com [--publish] [--replace]
 *
 * The owner becomes the owner the first time they sign in with that (verified) email.
 * Photos go to the same storage as normal uploads (Replit Object Storage on Replit).
 * Safe to run twice: without --replace it stops if the restaurant already exists.
 */
import "./_env";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { accessCodes, areas, media, menuCategories, menuItems, menuItemVariants, planEvents, restaurants, seats } from "../src/db/schema";
import { generateCode } from "../src/lib/access-code-format";
import { writeAudit } from "../src/lib/audit";
import { ensureJobRoles } from "../src/lib/personnel/role-catalog";
import { getStore, mediaUrl } from "../src/lib/storage";
import { randomToken } from "../src/lib/tokens";

const SLUG = "shangri-la";
const DIR = path.join(process.cwd(), "imports", "shangri-la");

type Item = { g?: string; name: string; p?: number | null; p2?: number; s?: number; d?: string; n?: string; nw?: number; parent?: string; variants?: string[] };
type Section = { id: string; t: string; hidden?: boolean; items: Item[] };
type Data = {
  MENU: Section[];
  EN_SECTIONS: Record<string, string>;
  ZH_SECTIONS: Record<string, string>;
  EN: Record<string, [string, string?]>;
  ZH: Record<string, [string, string?]>;
  PHOTOS: Record<string, string>;
  PHONES: string[];
  TABLES: string[];
  ROOMS: string[];
};

const STATION: Record<string, "grill" | "wok" | "kitchen" | "drinks" | "desserts"> = {
  brochettes: "grill",
  desserts: "desserts",
  "boissons-chaudes": "drinks",
  "boissons-fraiches": "drinks",
  aperitifs: "drinks",
  digestifs: "drinks",
  vins: "drinks",
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/** Width × height of a JPEG or PNG (for the media table). */
function imageSize(b: Buffer): { width: number; height: number } {
  if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

async function main() {
  const ownerEmail = arg("owner-email")?.trim().toLowerCase();
  if (!ownerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    console.error("Usage: npm run import:shangri-la -- --owner-email=owner@example.com [--publish] [--replace]");
    process.exitCode = 1;
    return;
  }
  const publish = process.argv.includes("--publish");
  const replace = process.argv.includes("--replace");
  const db = getDb();
  const store = getStore();
  const data = JSON.parse(readFileSync(path.join(DIR, "data.json"), "utf8")) as Data;

  const existing = await db.query.restaurants.findFirst({ where: eq(restaurants.slug, SLUG) });
  if (existing && !replace) {
    console.error(`« ${existing.name} » already exists (/r/${SLUG}). Run again with --replace to recreate it (its orders and personnel are deleted).`);
    process.exitCode = 1;
    return;
  }
  if (existing) await db.delete(restaurants).where(eq(restaurants.id, existing.id));

  const tr = (dict: Record<string, [string, string?]>, name: string) => dict[name] ?? [name];
  const phones = data.PHONES.map((p) => `226${p}`);
  const whatsapp = "22677299878";
  const [r] = await db
    .insert(restaurants)
    .values({
      slug: SLUG,
      name: "Shangri-La",
      legalName: "Restaurant Chinois Shangri-La",
      description: {
        fr: "Restaurant chinois à Ouaga 2000 : fondue chinoise, plats du chef, fruits de mer, brochettes, marmites et salons privés.",
        en: "Chinese restaurant in Ouaga 2000: Chinese hot pot, chef's dishes, seafood, skewers, hot pots and private rooms.",
        zh: "位于 Ouaga 2000 的中餐厅：火锅、厨师推荐、海鲜、烧烤串、砂锅和私人包间。",
      },
      theme: "lacquer",
      accentColor: "#D9AD55",
      phones: phones.filter((p) => p !== whatsapp).slice(0, 2).concat(whatsapp),
      whatsapp,
      address: "Ouaga 2000, Ouagadougou",
      city: "Ouagadougou",
      plan: "pro",
      planStatus: "trial",
      planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      published: publish,
      settings: {
        onboardedAt: new Date().toISOString(),
        seatingModes: ["table", "room", "takeaway"],
        qrStrategy: "per_seat",
        orderValidation: "server_confirms",
        enabledLocales: ["fr", "en", "zh"],
        features: { welcomeScreen: true, fortuneCookie: true, takeawayWhatsapp: true, share: true, localBadge: false },
        ownerEmail,
      },
    })
    .returning();
  const rid = r!.id;

  async function upload(file: string, thumb: string | null, kind: "item" | "logo") {
    const full = readFileSync(file);
    const id = randomBytes(18).toString("base64url");
    const ext = file.endsWith(".png") ? "png" : "jpg";
    const fullKey = `r/${rid}/${id}.${ext}`;
    const thumbKey = `r/${rid}/${id}-t.${ext}`;
    const small = thumb ? readFileSync(thumb) : full;
    await store.put(fullKey, full);
    await store.put(thumbKey, small);
    const { width, height } = imageSize(full);
    await db.insert(media).values({ restaurantId: rid, kind, fullKey, thumbKey, bytes: full.length + small.length, width, height, uploadedBy: "import" });
    return { photoUrl: mediaUrl(fullKey), thumbUrl: mediaUrl(thumbKey) };
  }

  // Logo (the restaurant's own app icon).
  const logo = await upload(path.join(DIR, "logo.png"), null, "logo");
  await db.update(restaurants).set({ logoUrl: logo.photoUrl }).where(eq(restaurants.id, rid));

  // Tables 1–20 (no 13, as in the restaurant) and the private rooms, each with its QR and RC number.
  const [salle, salons] = await db
    .insert(areas)
    .values([
      { restaurantId: rid, name: { fr: "Salle", en: "Dining room", zh: "大厅" }, sort: 1 },
      { restaurantId: rid, name: { fr: "Salons privés", en: "Private rooms", zh: "包间" }, sort: 2 },
    ])
    .returning();
  const tableRows = data.TABLES.map((label, i) => ({ restaurantId: rid, type: "table" as const, label, areaId: salle!.id, capacity: 4, qrToken: randomToken(), sort: i + 1 }));
  const roomRows = data.ROOMS.map((label, i) => ({ restaurantId: rid, type: "room" as const, label, areaId: salons!.id, capacity: 10, qrToken: randomToken(), sort: i + 1 }));
  const seatRows = await db
    .insert(seats)
    .values([...tableRows, ...roomRows, { restaurantId: rid, type: "takeaway" as const, label: "À emporter", qrToken: randomToken(), sort: 1 }])
    .returning({ id: seats.id });
  for (const target of [null, ...seatRows.map((s) => s.id)]) {
    for (let i = 0; i < 5; i++) {
      const done = await db.insert(accessCodes).values({ code: generateCode(), restaurantId: rid, seatId: target }).onConflictDoNothing().returning();
      if (done.length) break;
    }
  }

  // Menu.
  const photoCache = new Map<string, { photoUrl: string; thumbUrl: string }>();
  let items = 0;
  let photos = 0;
  const visible = data.MENU.filter((s) => !s.hidden);
  for (const [ci, sec] of visible.entries()) {
    const [cat] = await db
      .insert(menuCategories)
      .values({ restaurantId: rid, name: { fr: sec.t, en: data.EN_SECTIONS[sec.id] ?? sec.t, zh: data.ZH_SECTIONS[sec.id] ?? sec.t }, sort: ci + 1 })
      .returning();
    let sort = 0;
    for (const it of sec.items) {
      if (it.g || it.parent) continue;
      const [en, enDesc] = tr(data.EN, it.name);
      const [zh, zhDesc] = tr(data.ZH, it.name);
      const photoFile = data.PHOTOS[it.name] ?? (it.name.startsWith("Fondue chinoise") ? data.PHOTOS["Fondue chinoise"] : undefined);
      let pic: { photoUrl: string; thumbUrl: string } | null = null;
      if (photoFile) {
        const base = path.basename(photoFile);
        pic = photoCache.get(base) ?? null;
        if (!pic) {
          pic = await upload(path.join(DIR, "img", base), path.join(DIR, "img", "t", base), "item");
          photoCache.set(base, pic);
          photos++;
        }
      }
      const [row] = await db
        .insert(menuItems)
        .values({
          restaurantId: rid,
          categoryId: cat!.id,
          code: it.n ?? null,
          name: { fr: it.name, en, zh },
          description: it.d ? { fr: it.d, ...(enDesc ? { en: enDesc } : {}), ...(zhDesc ? { zh: zhDesc } : {}) } : null,
          price: it.p ?? null,
          spicy: Math.min(2, it.s ?? 0),
          tags: it.nw ? ["new"] : [],
          station: STATION[sec.id] ?? "kitchen",
          photoUrl: pic?.photoUrl ?? null,
          thumbUrl: pic?.thumbUrl ?? null,
          sort: ++sort,
        })
        .returning({ id: menuItems.id });
      items++;
      // Champagne: two prices → two variants.
      if (it.variants?.length) {
        const variants = it.variants
          .map((v) => data.MENU.flatMap((s) => s.items).find((x) => x.name === v))
          .filter((v): v is Item => Boolean(v && v.p));
        await db.insert(menuItemVariants).values(
          variants.map((v, i) => ({ restaurantId: rid, itemId: row!.id, name: { fr: v.name, en: tr(data.EN, v.name)[0], zh: tr(data.ZH, v.name)[0] }, price: v.p!, sort: i + 1 })),
        );
      }
    }
  }

  await ensureJobRoles(db, rid);
  await db.insert(planEvents).values({ restaurantId: rid, toPlan: "pro", toStatus: "trial", automatic: true, reference: "import:shangri-la" });
  await writeAudit(db, null, { restaurantId: rid, action: "restaurant.imported", entity: "restaurant", entityId: rid, data: { source: "shangri-la-menu", items, photos } });

  const [rc] = await db.select({ code: accessCodes.code }).from(accessCodes).where(eq(accessCodes.restaurantId, rid)).limit(1);
  console.log(`✓ Shangri-La: ${visible.length} categories, ${items} items, ${photos} photos, ${tableRows.length} tables, ${roomRows.length} rooms`);
  console.log(`  Menu: /r/${SLUG} (${publish ? "published" : "not published yet: add --publish, or the owner publishes it"})`);
  console.log(`  Owner: the first sign-in with ${ownerEmail} (verified) becomes the owner.`);
  if (rc) console.log(`  Numéro RC: RC-${rc.code}`);
  console.log(`  Photos stored with: ${store.kind}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

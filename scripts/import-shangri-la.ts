/**
 * Creates the real Shangri-La restaurant (Ouaga 2000) from its existing menu site
 * (github.com/tieyiwe/shangri-la-menu, copied in imports/shangri-la): 16 categories, ~286 dishes
 * and drinks in FR/EN/ZH with prices, spice levels, « nouveau » tags, the Champagne's two prices,
 * 78 photos, contacts, 19 tables and 12 private rooms.
 *
 *   npm run import:shangri-la [-- --owner-email=owner@example.com] [--draft] [--replace] [--if-missing]
 *
 * Runs by itself on every deploy start with --if-missing (see .replit): it is created once.
 *
 * Published and featured « À la une » (first) by default; --draft keeps it hidden.
 *
 * The owner becomes the owner the first time they sign in with that (verified) email.
 * Photos go to the same storage as normal uploads (Replit Object Storage on Replit).
 * Safe to run twice: without --replace it stops if the restaurant already exists.
 */
import "./_env";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { accessCodes, areas, media, members, menuCategories, menuItems, menuItemVariants, planEvents, restaurants, seats } from "../src/db/schema";
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

/** Uploads a photo (and its thumbnail) to the store and records it in `media`. */
function uploader(db: ReturnType<typeof getDb>, store: ReturnType<typeof getStore>, rid: string) {
  return async function upload(file: string, thumb: string | null, kind: "item" | "logo") {
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
  };
}

/** The source photo of a dish (the fondue photo serves both portions). */
function photoFor(data: Data, name: string): string | undefined {
  return data.PHOTOS[name] ?? (name.startsWith("Fondue chinoise") ? data.PHOTOS["Fondue chinoise"] : undefined);
}

/**
 * Makes sure Shangri-La shows every photo of its menu: a dish with a source photo but no picture
 * (only while nobody owns the restaurant: after that it is the owner's choice), or whose picture
 * file is missing from the storage (never intended), gets it uploaded again. Same for the logo.
 * Runs on every deploy start; does nothing when all is in place.
 */
async function repairPhotos(db: ReturnType<typeof getDb>, store: ReturnType<typeof getStore>, data: Data, r: { id: string; logoUrl: string | null }, owned: boolean) {
  const upload = uploader(db, store, r.id);
  const exists = async (url: string | null) => {
    const key = url?.startsWith("/api/media/") ? url.slice("/api/media/".length) : null;
    return key ? (await store.get(key).catch(() => null)) !== null : false;
  };
  let fixed = 0;
  let failed = 0;
  if ((!r.logoUrl && !owned) || (r.logoUrl && r.logoUrl.includes(`/r/${r.id}/`) && !(await exists(r.logoUrl)))) {
    const logo = await upload(path.join(DIR, "logo.png"), null, "logo");
    await db.update(restaurants).set({ logoUrl: logo.photoUrl }).where(eq(restaurants.id, r.id));
    fixed++;
  }
  const rows = await db.select({ id: menuItems.id, name: menuItems.name, photoUrl: menuItems.photoUrl }).from(menuItems).where(eq(menuItems.restaurantId, r.id));
  const cache = new Map<string, { photoUrl: string; thumbUrl: string }>();
  for (const row of rows) {
    const file = photoFor(data, row.name.fr);
    if (!file) continue;
    const missing = row.photoUrl ? !(await exists(row.photoUrl)) : !owned;
    if (!missing) continue;
    const base = path.basename(file);
    let pic = cache.get(base);
    if (!pic) {
      try {
        pic = await upload(path.join(DIR, "img", base), path.join(DIR, "img", "t", base), "item");
      } catch (err) {
        // Visible in the deploy logs: the storage refused the photo (bucket missing, no access…).
        console.error(`✗ Shangri-La: photo « ${row.name.fr} » could not be stored: ${err instanceof Error ? err.message : err}`);
        failed++;
        continue;
      }
      cache.set(base, pic);
    }
    await db.update(menuItems).set({ photoUrl: pic.photoUrl, thumbUrl: pic.thumbUrl }).where(eq(menuItems.id, row.id));
    fixed++;
  }
  if (failed) console.error(`✗ Shangri-La: ${failed} photo(s) could not be stored. Check Object Storage (bucket in .replit) then restart.`);
  const withPhoto = rows.filter((x) => photoFor(data, x.name.fr)).length;
  console.log(fixed ? `✓ Shangri-La: ${fixed} photo(s) restored (${withPhoto} dishes have a photo).` : `✓ Shangri-La: all ${withPhoto} dish photos in place.`);
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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function main() {
  // The owner's email: --owner-email, or the SHANGRILA_OWNER_EMAIL secret. Optional: without it the
  // restaurant is created anyway, and the email can be added later (set the secret and restart).
  const rawEmail = (arg("owner-email") ?? process.env.SHANGRILA_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (rawEmail && !EMAIL.test(rawEmail)) {
    console.error(`Invalid owner email: ${rawEmail}`);
    process.exitCode = 1;
    return;
  }
  const ownerEmail = rawEmail || null;
  const publish = !process.argv.includes("--draft");
  const replace = process.argv.includes("--replace");
  /** Used on every deploy start: create it only if it isn't there, never fail the start. */
  const ifMissing = process.argv.includes("--if-missing");
  const db = getDb();
  const store = getStore();
  const data = JSON.parse(readFileSync(path.join(DIR, "data.json"), "utf8")) as Data;

  const existing = await db.query.restaurants.findFirst({ where: eq(restaurants.slug, SLUG) });
  if (existing && !replace) {
    // Already there. If an owner email arrived since and nobody owns it yet, record it for the claim.
    if (ownerEmail && !existing.settings.ownerEmail) {
      const [owner] = await db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, existing.id), eq(members.role, "owner"))).limit(1);
      if (!owner) {
        await db.update(restaurants).set({ settings: { ...existing.settings, ownerEmail } }).where(eq(restaurants.id, existing.id));
        console.log(`✓ Shangri-La: owner email recorded (${ownerEmail}).`);
      }
    }
    // One-time fix while nobody owns it yet: like the original Shangri-La menu, one QR for the
    // restaurant where customers pick their table or room (with the « déjà prise » warning).
    // Table/room QRs keep working. The owner can change it in Paramètres.
    const fresh = (await db.query.restaurants.findFirst({ where: eq(restaurants.id, existing.id) }))!;
    const [anyOwner] = await db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, existing.id), eq(members.role, "owner"))).limit(1);
    if (!anyOwner && (fresh.settings.qrStrategy !== "generic" || !fresh.settings.accent2)) {
      // …and the « Laque d'or » palette's accent (lacquer red) next to its gold.
      await db
        .update(restaurants)
        .set({ settings: { ...fresh.settings, qrStrategy: "generic", accent2: fresh.settings.accent2 ?? "#C0392B" } })
        .where(eq(restaurants.id, existing.id));
      console.log("✓ Shangri-La: table/room picker from the main QR, lacquer red accent.");
    }
    await repairPhotos(db, store, data, fresh, Boolean(anyOwner));
    if (ifMissing) {
      console.log("✓ Shangri-La already exists.");
      return;
    }
    console.error(`« ${existing.name} » already exists (/r/${SLUG}). Run again with --replace to recreate it (its orders and personnel are deleted).`);
    process.exitCode = 1;
    return;
  }
  if (existing) await db.delete(restaurants).where(eq(restaurants.id, existing.id));
  if (publish && existing?.featuredRank !== 1) {
    // Shangri-La goes first « À la une »: the others move down one place (only 3 are shown).
    await db.execute(sql`update restaurants set featured_rank = case when featured_rank >= 3 then null else featured_rank + 1 end where featured_rank is not null`);
  }

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
      featuredRank: publish ? 1 : null,
      settings: {
        onboardedAt: new Date().toISOString(),
        seatingModes: ["table", "room", "takeaway"],
        qrStrategy: "generic",
        accent2: "#C0392B",
        orderValidation: "server_confirms",
        enabledLocales: ["fr", "en", "zh"],
        features: { welcomeScreen: true, fortuneCookie: true, takeawayWhatsapp: true, share: true, localBadge: false },
        ...(ownerEmail ? { ownerEmail } : {}),
      },
    })
    .returning();
  const rid = r!.id;

  const upload = uploader(db, store, rid);

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
      const photoFile = photoFor(data, it.name);
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
  console.log(`  Menu: /r/${SLUG} (${publish ? "published, featured first « À la une »" : "draft: the owner publishes it"})`);
  console.log(ownerEmail ? `  Owner: the first sign-in with ${ownerEmail} (verified) becomes the owner.` : "  Owner: not set yet (add the SHANGRILA_OWNER_EMAIL secret, then restart).");
  if (rc) console.log(`  Numéro RC: RC-${rc.code}`);
  console.log(`  Photos stored with: ${store.kind}`);
}

main()
  .catch((err) => {
    console.error(err);
    // On a deploy start the site must come up even if the import has a problem.
    process.exitCode = process.argv.includes("--if-missing") ? 0 : 1;
  })
  .finally(() => closeDb());

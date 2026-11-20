/**
 * Prepares the real « La Terrace » (Restaurant · Bar · Lounge, Ouagadougou) from its menu site
 * (laterrace-menu.pages.dev: food-menu.pdf and drinks-menu.pdf, copied in imports/la-terrace):
 * 24 categories, 250 dishes and drinks in French with prices (beers 33/50/66 cl and spirits
 * « verre / bouteille » as variants), no dish photos (the owner adds them), the logo (transparent)
 * and the front photo (neon sign at night) as the cover.
 *
 *   npm run import:la-terrace [-- --owner-email=owner@example.com] [--draft] [--replace] [--if-missing]
 *
 * Runs by itself on every deploy start with --if-missing (scripts/serve.mjs): created once.
 * Published by default (not « À la une »); --draft keeps it hidden.
 *
 * The setup is left for the owner: the first sign-in with the owner's (verified) email makes them
 * the owner (LATERRACE_OWNER_EMAIL secret or --owner-email) and opens the setup wizard, prefilled,
 * where they check the contacts, choose their tables and add photos.
 */
import "./_env";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { accessCodes, media, members, menuCategories, menuItems, menuItemVariants, planEvents, restaurants, seats } from "../src/db/schema";
import { generateCode } from "../src/lib/access-code-format";
import { writeAudit } from "../src/lib/audit";
import { ensureJobRoles } from "../src/lib/personnel/role-catalog";
import { getStore, mediaUrl } from "../src/lib/storage";
import { randomToken } from "../src/lib/tokens";

const SLUG = "la-terrace";
const SOURCE = "la-terrace-menu";
const DIR = path.join(process.cwd(), "imports", "la-terrace");

type Item = { name: string; p?: number; d?: string; variants?: Array<{ name: string; p: number }> };
type Category = { id: string; fr: string; en: string; station: "kitchen" | "grill" | "drinks" | "desserts"; items: Item[] };
type Data = { CATEGORIES: Category[] };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/** Width × height of a PNG or a JPEG. */
function imageSize(b: Buffer): { width: number; height: number } {
  if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length && b[i] === 0xff) {
    const marker = b[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { width: 0, height: 0 };
}

/** Stores a picture (and its thumbnail) and records it in `media`; returns its public address. */
async function storePicture(db: ReturnType<typeof getDb>, rid: string, kind: "logo" | "cover", file: string, thumbFile?: string) {
  const store = getStore();
  const full = readFileSync(path.join(DIR, file));
  const small = thumbFile ? readFileSync(path.join(DIR, thumbFile)) : full;
  const ext = file.endsWith(".png") ? "png" : "jpg";
  const id = randomBytes(18).toString("base64url");
  const fullKey = `r/${rid}/${id}.${ext}`;
  const thumbKey = `r/${rid}/${id}-t.${ext}`;
  await store.put(fullKey, full);
  await store.put(thumbKey, small);
  await db.insert(media).values({ restaurantId: rid, kind, fullKey, thumbKey, bytes: full.length + small.length, ...imageSize(full), uploadedBy: "import" });
  return mediaUrl(fullKey);
}

/** Bumped when imports/la-terrace/cover.jpg changes: an unowned La Terrace gets the new one. */
const COVER_VERSION = 2;

/**
 * The front of the restaurant at night (neon sign), cropped to the public page banner
 * (2.44:1 = 390 × 160 on phones, sign in the vertical centre so wider screens keep it).
 */
async function addCover(db: ReturnType<typeof getDb>, rid: string) {
  const coverUrl = await storePicture(db, rid, "cover", "cover.jpg", "cover-t.jpg");
  const [row] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, rid));
  await db.update(restaurants).set({ coverUrl, settings: { ...row!.settings, importedCover: COVER_VERSION } }).where(eq(restaurants.id, rid));
}

async function main() {
  const rawEmail = (arg("owner-email") ?? process.env.LATERRACE_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (rawEmail && !EMAIL.test(rawEmail)) {
    console.error(`Invalid owner email: ${rawEmail}`);
    process.exitCode = 1;
    return;
  }
  const ownerEmail = rawEmail || null;
  const publish = !process.argv.includes("--draft");
  const replace = process.argv.includes("--replace");
  const ifMissing = process.argv.includes("--if-missing");
  const db = getDb();
  const data = JSON.parse(readFileSync(path.join(DIR, "data.json"), "utf8")) as Data;

  const existing = await db.query.restaurants.findFirst({ where: eq(restaurants.slug, SLUG) });
  if (existing) {
    const ours = existing.settings.importedFrom === SOURCE;
    if (!ours) {
      // Someone created a business with this address on their own: never touch it.
      console.log(`! La Terrace: /r/${SLUG} already belongs to another business: nothing imported.`);
      return;
    }
    const [owner] = await db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, existing.id), eq(members.role, "owner"))).limit(1);
    // An owner email that arrived since (secret added later), while nobody owns it yet.
    if (ownerEmail && !owner && existing.settings.ownerEmail !== ownerEmail) {
      await db.update(restaurants).set({ settings: { ...existing.settings, ownerEmail } }).where(eq(restaurants.id, existing.id));
      console.log(`✓ La Terrace: owner email recorded (${ownerEmail}).`);
    }
    // The front photo, for a La Terrace imported before it existed or with an older crop
    // (only while nobody owns it, and never over a photo someone uploaded).
    const importedCover = existing.settings.importedCover ?? (existing.coverUrl ? 1 : 0);
    const ownCover = !existing.coverUrl || importedCover > 0;
    if (!owner && !replace && ownCover && importedCover < COVER_VERSION) {
      try {
        await addCover(db, existing.id);
        console.log("✓ La Terrace: front photo added.");
      } catch (err) {
        console.error(`✗ La Terrace: front photo could not be stored: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!replace) {
      console.log(ifMissing ? "✓ La Terrace already exists." : `« ${existing.name} » already exists (/r/${SLUG}). Use --replace to recreate it.`);
      if (!ifMissing) process.exitCode = 1;
      return;
    }
    if (owner) {
      console.error("La Terrace has an owner now: it is theirs, --replace is refused.");
      process.exitCode = 1;
      return;
    }
    await db.delete(restaurants).where(eq(restaurants.id, existing.id));
  }

  const [r] = await db
    .insert(restaurants)
    .values({
      slug: SLUG,
      name: "La Terrace",
      description: {
        fr: "Restaurant · Bar · Lounge : grillades, pizzas, pâtes, burgers, cocktails et chichas.",
        en: "Restaurant · Bar · Lounge: grills, pizzas, pasta, burgers, cocktails and shisha.",
      },
      theme: "warm",
      accentColor: "#9B3D15",
      phones: ["22657766868"],
      address: "8F8G+2M, Ouagadougou",
      city: "Ouagadougou",
      gmapsUrl: "https://www.google.com/maps/search/?api=1&query=12.3151053,-1.5232884",
      latitude: 12.3151053,
      longitude: -1.5232884,
      locationSource: "link",
      locationSetAt: new Date(),
      plan: "pro",
      planStatus: "trial",
      planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      published: publish,
      settings: {
        importedFrom: SOURCE,
        // Dine-in, takeaway and delivery (as on Google Maps). Tables are chosen by the owner in setup.
        seatingModes: ["table", "takeaway", "delivery"],
        qrStrategy: "generic",
        accent2: "#D9AD55",
        orderValidation: "server_confirms",
        enabledLocales: ["fr", "en"],
        features: { welcomeScreen: true, fortuneCookie: true, takeawayWhatsapp: true, share: true, localBadge: false },
        ...(ownerEmail ? { ownerEmail } : {}),
      },
    })
    .returning();
  const rid = r!.id;

  // Logo: the emblem in the restaurant's leather brown on a transparent background.
  const logoUrl = await storePicture(db, rid, "logo", "logo.png");
  await db.update(restaurants).set({ logoUrl }).where(eq(restaurants.id, rid));
  await addCover(db, rid);

  // Takeaway and delivery places; the main QR and its numéro RC.
  const placeRows = await db
    .insert(seats)
    .values([
      { restaurantId: rid, type: "takeaway" as const, label: "À emporter", qrToken: randomToken(), sort: 1 },
      { restaurantId: rid, type: "delivery" as const, label: "Livraison", qrToken: randomToken(), sort: 2 },
    ])
    .returning({ id: seats.id });
  for (const target of [null, ...placeRows.map((s) => s.id)]) {
    for (let i = 0; i < 5; i++) {
      const done = await db.insert(accessCodes).values({ code: generateCode(), restaurantId: rid, seatId: target }).onConflictDoNothing().returning();
      if (done.length) break;
    }
  }

  // Menu.
  let items = 0;
  for (const [ci, c] of data.CATEGORIES.entries()) {
    const [cat] = await db.insert(menuCategories).values({ restaurantId: rid, name: { fr: c.fr, en: c.en }, sort: ci + 1 }).returning();
    for (const [ii, it] of c.items.entries()) {
      const [row] = await db
        .insert(menuItems)
        .values({
          restaurantId: rid,
          categoryId: cat!.id,
          name: { fr: it.name },
          description: it.d ? { fr: it.d } : null,
          price: it.variants?.length ? null : (it.p ?? null),
          station: c.station,
          sort: ii + 1,
        })
        .returning({ id: menuItems.id });
      items++;
      if (it.variants?.length) {
        await db.insert(menuItemVariants).values(it.variants.map((v, i) => ({ restaurantId: rid, itemId: row!.id, name: { fr: v.name }, price: v.p, sort: i + 1 })));
      }
    }
  }

  await ensureJobRoles(db, rid);
  await db.insert(planEvents).values({ restaurantId: rid, toPlan: "pro", toStatus: "trial", automatic: true, reference: "import:la-terrace" });
  await writeAudit(db, null, { restaurantId: rid, action: "restaurant.imported", entity: "restaurant", entityId: rid, data: { source: SOURCE, items } });

  const [rc] = await db.select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, rid))).limit(1);
  console.log(`✓ La Terrace: ${data.CATEGORIES.length} categories, ${items} items (no photos yet)`);
  console.log(`  Menu: /r/${SLUG} (${publish ? "published" : "draft"})`);
  console.log(ownerEmail ? `  Owner: the first sign-in with ${ownerEmail} (verified) becomes the owner, then finishes the setup.` : "  Owner: not set yet (add the LATERRACE_OWNER_EMAIL secret, then restart).");
  if (rc) console.log(`  Numéro RC: RC-${rc.code}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = process.argv.includes("--if-missing") ? 0 : 1;
  })
  .finally(() => closeDb());

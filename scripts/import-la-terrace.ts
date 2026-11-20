/**
 * Prepares the real « La Terrace » (Restaurant · Bar · Lounge, Ouagadougou) from its menu site
 * (laterrace-menu.pages.dev: food-menu.pdf and drinks-menu.pdf, copied in imports/la-terrace):
 * 24 categories, 250 dishes and drinks in French with prices (beers 33/50/66 cl and spirits
 * « verre / bouteille » as variants), no photos (the owner adds them), the logo (transparent).
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

/** Width × height of a PNG. */
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });

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
  const store = getStore();
  const logo = readFileSync(path.join(DIR, "logo.png"));
  const id = randomBytes(18).toString("base64url");
  const fullKey = `r/${rid}/${id}.png`;
  const thumbKey = `r/${rid}/${id}-t.png`;
  await store.put(fullKey, logo);
  await store.put(thumbKey, logo);
  await db.insert(media).values({ restaurantId: rid, kind: "logo", fullKey, thumbKey, bytes: logo.length * 2, ...pngSize(logo), uploadedBy: "import" });
  await db.update(restaurants).set({ logoUrl: mediaUrl(fullKey) }).where(eq(restaurants.id, rid));

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

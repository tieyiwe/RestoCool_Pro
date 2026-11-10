import "./_env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb, type DB } from "../src/db";
import { generateCode } from "../src/lib/access-code-format";
import { hashPin } from "../src/lib/personnel/pin";
import { ensureJobRoles } from "../src/lib/personnel/role-catalog";
import {
  accessCodes,
  areas,
  fortunes,
  menuCategories,
  menuItemOptions,
  menuItemVariants,
  menuItems,
  members,
  openingHours,
  planEvents,
  restaurants,
  seats,
} from "../src/db/schema";
import { writeAudit } from "../src/lib/audit";
import { randomToken } from "../src/lib/tokens";
import { DEMO_CATEGORIES, DEMO_FORTUNES } from "./seed-data";

const DEMO_SLUG = "restaurant-demo";
const TEST_SLUG = "maquis-temoin";
const IMG_DIR = path.join(process.cwd(), "public", "demo");

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/**
 * Locally generated placeholder (no stock photos): category color and dish number only, so the
 * picture reads the same in French, English and Chinese (the name is shown next to it, translated).
 */
function placeholderSvg(code: string, _label: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1c1917"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="175" r="105" fill="#fff" opacity=".14"/><circle cx="200" cy="175" r="78" fill="#fff" opacity=".18"/><text x="200" y="198" font-family="system-ui,sans-serif" font-size="72" font-weight="800" fill="#fff" text-anchor="middle">${escapeXml(code)}</text></svg>`;
}

async function resetRestaurant(db: DB, slug: string) {
  // Cascades to every tenant table.
  await db.delete(restaurants).where(eq(restaurants.slug, slug));
}

async function seedDemo(db: DB) {
  await resetRestaurant(db, DEMO_SLUG);
  await mkdir(IMG_DIR, { recursive: true });

  const [r] = await db
    .insert(restaurants)
    .values({
      // Featured on restocool.com for the demo (the platform admin chooses real ones later).
      featuredRank: 1,
      slug: DEMO_SLUG,
      name: "Restaurant Démo",
      description: {
        fr: "Grillades, plats locaux et jus maison. Terrasse et salons climatisés.",
        en: "Grills, local dishes and homemade juices. Terrace and air-conditioned rooms.",
        zh: "烧烤、本地菜和自制果汁。设有露台和空调包间。",
      },
      legalName: "Restaurant Démo (fictif)",
      theme: "warm",
      accentColor: "#0F6B3E",
      phones: ["22670000001", "22670000002"],
      whatsapp: "22670000001",
      orangeMoney: "22670000003",
      moovMoney: "22660000004",
      address: "Avenue de la Démo, Ouagadougou",
      city: "Ouagadougou",
      // Fictional point in central Ouagadougou (not a real business).
      latitude: 12.3714,
      longitude: -1.5197,
      locationSource: "link",
      locationSetAt: new Date(),
      gmapsUrl: "https://www.google.com/maps/search/?api=1&query=12.3714,-1.5197",
      plan: "pro",
      planStatus: "trial",
      planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      published: true,
      settings: {
        onboardedAt: new Date().toISOString(),
        seatingModes: ["table", "area", "room", "takeaway"],
        qrStrategy: "per_seat",
        orderValidation: "server_confirms",
        enabledLocales: ["fr", "en", "zh"],
        features: { welcomeScreen: true, fortuneCookie: true, takeawayWhatsapp: true, share: true, localBadge: true },
        inactivity: { warnAfterSec: 240, releaseAfterSec: 30 },
      },
    })
    .returning();
  const restaurantId = r!.id;

  // Opening hours: every day 10:00–23:00, Friday and Saturday until 01:00.
  await db.insert(openingHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      restaurantId,
      weekday,
      opens: "10:00",
      closes: weekday === 5 || weekday === 6 ? "01:00" : "23:00",
    })),
  );

  const [terrasse, salle] = await db
    .insert(areas)
    .values([
      { restaurantId, name: { fr: "Terrasse", en: "Terrace", zh: "露台" }, sort: 1 },
      { restaurantId, name: { fr: "Salle climatisée", en: "Air-conditioned room", zh: "空调大厅" }, sort: 2 },
    ])
    .returning();

  await db.insert(seats).values([
    ...Array.from({ length: 10 }, (_, i) => ({
      restaurantId,
      type: "table" as const,
      label: String(i + 1),
      areaId: i < 6 ? terrasse!.id : salle!.id,
      capacity: i % 3 === 0 ? 6 : 4,
      qrToken: randomToken(),
      sort: i + 1,
    })),
    { restaurantId, type: "room" as const, label: "Salon Ouaga", capacity: 12, qrToken: randomToken(), sort: 1 },
    { restaurantId, type: "room" as const, label: "Salon 201", capacity: 8, qrToken: randomToken(), sort: 2 },
    { restaurantId, type: "room" as const, label: "Salon 601", capacity: 10, qrToken: randomToken(), sort: 3 },
    { restaurantId, type: "takeaway" as const, label: "À emporter", qrToken: randomToken(), sort: 1 },
  ]);

  let itemCount = 0;
  for (const [ci, cat] of DEMO_CATEGORIES.entries()) {
    const [category] = await db
      .insert(menuCategories)
      .values({ restaurantId, name: cat.name, sort: ci + 1 })
      .returning();
    for (const [ii, item] of cat.items.entries()) {
      const file = `item-${item.code}.svg`;
      await writeFile(path.join(IMG_DIR, file), placeholderSvg(item.code, item.name.fr, cat.color));
      const [row] = await db
        .insert(menuItems)
        .values({
          restaurantId,
          categoryId: category!.id,
          code: item.code,
          name: item.name,
          description: item.description ?? null,
          price: item.price,
          spicy: item.spicy ?? 0,
          tags: item.tags ?? [],
          station: item.station ?? cat.station,
          photoUrl: `/demo/${file}`,
          thumbUrl: `/demo/${file}`,
          sort: ii + 1,
        })
        .returning();
      itemCount++;
      if (item.variants?.length) {
        await db.insert(menuItemVariants).values(
          item.variants.map((v, vi) => ({ restaurantId, itemId: row!.id, name: v.name, price: v.price, sort: vi + 1 })),
        );
      }
      if (item.options?.length) {
        await db.insert(menuItemOptions).values(
          item.options.map((o, oi) => ({
            restaurantId,
            itemId: row!.id,
            group: o.group,
            name: o.name,
            priceDelta: o.priceDelta,
            maxSelect: o.maxSelect ?? 1,
            sort: oi + 1,
          })),
        );
      }
    }
  }

  await db.insert(fortunes).values(DEMO_FORTUNES.map((text) => ({ restaurantId, text })));
  // The demo's numéro RC (main QR), so it can be found in the directory right away.
  for (let i = 0; i < 5; i++) {
    const done = await db.insert(accessCodes).values({ code: generateCode(), restaurantId, seatId: null }).onConflictDoNothing().returning();
    if (done.length) break;
  }
  // Fictional personnel with their matricules. "dev-owner" is the local dev sign-in; the other
  // ids are placeholders nobody can sign in with.
  await db.insert(members).values([
    { restaurantId, clerkUserId: "dev-owner", name: "Propriétaire Démo", role: "owner", staffNo: 1 },
    // Demo PINs (fictional personnel, demo restaurant only): Awa 002 → 1234, Issa 003 → 5678.
    { restaurantId, clerkUserId: null, name: "Awa (serveuse)", role: "server", staffNo: 2, pinHash: await hashPin("1234") },
    { restaurantId, clerkUserId: null, name: "Issa (cuisine)", role: "kitchen", staffNo: 3, pinHash: await hashPin("5678") },
  ]);
  // Ready-made job roles; Awa becomes « Serveur·se », Issa « Cuisinier·ère ».
  await ensureJobRoles(db, restaurantId);
  await db.insert(planEvents).values({ restaurantId, toPlan: "pro", toStatus: "trial", automatic: true, reference: "seed" });
  await writeAudit(db, null, { restaurantId, action: "restaurant.seeded", entity: "restaurant", entityId: restaurantId });

  console.log(`✓ ${r!.name}: ${DEMO_CATEGORIES.length} categories, ${itemCount} items, 14 seats, ${DEMO_FORTUNES.length} fortunes`);
}

/** A second, unpublished tenant used only by the tenant-isolation tests. */
async function seedTestTenant(db: DB) {
  await resetRestaurant(db, TEST_SLUG);
  const [r] = await db
    .insert(restaurants)
    .values({ slug: TEST_SLUG, name: "Maquis Témoin (test)", plan: "gratuit", planStatus: "active", published: false })
    .returning();
  const [c] = await db
    .insert(menuCategories)
    .values({ restaurantId: r!.id, name: { fr: "Secret" } })
    .returning();
  await db.insert(menuItems).values({ restaurantId: r!.id, categoryId: c!.id, name: { fr: "Plat secret du témoin" }, price: 999 });
  console.log(`✓ ${r!.name} (isolation tests)`);
}

async function main() {
  const db = getDb();
  await seedDemo(db);
  if (process.argv.includes("--with-test-tenant")) await seedTestTenant(db);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

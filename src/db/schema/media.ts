import { index, integer, pgEnum, text, uuid, pgTable } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { restaurants } from "./restaurants";

export const mediaKindEnum = pgEnum("media_kind", ["item", "logo", "cover"]);

/** Uploaded images (already compressed to WebP in the browser), stored in Object Storage. */
export const media = pgTable(
  "media",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull(),
    /** Object Storage key of the full image (max 1200px). */
    fullKey: text("full_key").notNull(),
    /** Object Storage key of the 168px square thumbnail. */
    thumbKey: text("thumb_key").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    uploadedBy: text("uploaded_by"),
    ...timestamps,
  },
  (t) => [index("media_restaurant_idx").on(t.restaurantId)],
);

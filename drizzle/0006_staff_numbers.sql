ALTER TABLE "members" ADD COLUMN "staff_no" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "taken_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prepared_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "served_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_taken_by_members_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_members_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_prepared_by_members_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_served_by_members_id_fk" FOREIGN KEY ("served_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_members_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing personnel get their matricule in order of arrival (the owner is usually 001).
UPDATE "members" m SET "staff_no" = n.rn FROM (SELECT "id", row_number() OVER (PARTITION BY "restaurant_id" ORDER BY "created_at", "id") AS rn FROM "members") n WHERE n."id" = m."id" AND m."staff_no" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "members_restaurant_staff_no_uq" ON "members" USING btree ("restaurant_id","staff_no");
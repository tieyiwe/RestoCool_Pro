ALTER TABLE "reservations" ADD COLUMN "checkin_hash" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "checked_in_by" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "checked_in_via" text;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_checkin_uq" ON "reservations" USING btree ("checkin_hash");
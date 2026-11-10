CREATE TABLE "access_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"seat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_codes_restaurant_idx" ON "access_codes" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_codes_seat_uq" ON "access_codes" USING btree ("seat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_codes_main_uq" ON "access_codes" USING btree ("restaurant_id") WHERE "access_codes"."seat_id" is null;
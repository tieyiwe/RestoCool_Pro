ALTER TYPE "public"."seat_type" ADD VALUE 'seat';--> statement-breakpoint
CREATE TABLE "buses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb NOT NULL,
	"qr_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"bus_id" uuid NOT NULL,
	"route" text NOT NULL,
	"departure_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "seats_restaurant_type_label_uq";--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "kind" text DEFAULT 'restaurant' NOT NULL;--> statement-breakpoint
ALTER TABLE "seats" ADD COLUMN "bus_id" uuid;--> statement-breakpoint
ALTER TABLE "seats" ADD COLUMN "map_row" smallint;--> statement-breakpoint
ALTER TABLE "seats" ADD COLUMN "map_col" smallint;--> statement-breakpoint
ALTER TABLE "seats" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "trip_id" uuid;--> statement-breakpoint
ALTER TABLE "buses" ADD CONSTRAINT "buses_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_opened_by_members_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_closed_by_members_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buses_restaurant_idx" ON "buses" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buses_qr_token_uq" ON "buses" USING btree ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "buses_restaurant_name_uq" ON "buses" USING btree ("restaurant_id","name");--> statement-breakpoint
CREATE INDEX "trips_restaurant_idx" ON "trips" USING btree ("restaurant_id","departure_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_one_open_per_bus" ON "trips" USING btree ("bus_id") WHERE "trips"."status" = 'open';--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seats_bus_idx" ON "seats" USING btree ("bus_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_bus_label_uq" ON "seats" USING btree ("bus_id","label") WHERE "seats"."bus_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "seats_restaurant_type_label_uq" ON "seats" USING btree ("restaurant_id","type","label") WHERE "seats"."bus_id" is null;
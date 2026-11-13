CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"party_size" smallint NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"note" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"token_hash" text NOT NULL,
	"device_hash" text,
	"contacted_at" timestamp with time zone,
	"contacted_by" text,
	"reason" text,
	"cancelled_by" text,
	"status_by" text,
	"status_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_party_range" CHECK ("reservations"."party_size" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_day_idx" ON "reservations" USING btree ("restaurant_id","date","time");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_ref_uq" ON "reservations" USING btree ("restaurant_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_token_uq" ON "reservations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "reservations_created_idx" ON "reservations" USING btree ("created_at");
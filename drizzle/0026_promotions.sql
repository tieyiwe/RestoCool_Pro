CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"restaurant_id" uuid,
	"placement" text NOT NULL,
	"item_id" uuid,
	"title" jsonb NOT NULL,
	"body" jsonb,
	"cta_label" jsonb,
	"link" text,
	"image_url" text,
	"badge" text,
	"promo_price" integer,
	"theme" text DEFAULT 'gold' NOT NULL,
	"target" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promotions_scope_idx" ON "promotions" USING btree ("scope","placement","active");--> statement-breakpoint
CREATE INDEX "promotions_restaurant_idx" ON "promotions" USING btree ("restaurant_id");
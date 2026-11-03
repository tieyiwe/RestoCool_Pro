CREATE TYPE "public"."actor_type" AS ENUM('member', 'staff', 'superadmin', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'server', 'kitchen', 'cashier');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('gratuit', 'pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('trial', 'active', 'past_due', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."seat_type" AS ENUM('table', 'room', 'area', 'counter', 'takeaway', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."station" AS ENUM('grill', 'wok', 'kitchen', 'drinks', 'desserts');--> statement-breakpoint
CREATE TYPE "public"."menu_theme" AS ENUM('lacquer', 'light', 'warm');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"name" text,
	"role" "member_role" DEFAULT 'manager' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens" time NOT NULL,
	"closes" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_restaurant_id" uuid,
	"clerk_org_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"logo_url" text,
	"cover_url" text,
	"theme" "menu_theme" DEFAULT 'warm' NOT NULL,
	"accent_color" text DEFAULT '#0E7C4A' NOT NULL,
	"phones" text[] DEFAULT '{}' NOT NULL,
	"whatsapp" text,
	"orange_money" text,
	"moov_money" text,
	"address" text,
	"city" text DEFAULT 'Ouagadougou' NOT NULL,
	"gmaps_url" text,
	"timezone" text DEFAULT 'Africa/Ouagadougou' NOT NULL,
	"default_locale" text DEFAULT 'fr' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan" "plan" DEFAULT 'pro' NOT NULL,
	"plan_status" "plan_status" DEFAULT 'trial' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"powered_badge" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"type" "seat_type" NOT NULL,
	"label" text NOT NULL,
	"area_id" uuid,
	"capacity" smallint,
	"qr_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fortunes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"text" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"time_window" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"group" jsonb NOT NULL,
	"name" jsonb NOT NULL,
	"price_delta" integer DEFAULT 0 NOT NULL,
	"max_select" smallint DEFAULT 1 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"code" text,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"price" integer,
	"spicy" smallint DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"station" "station" DEFAULT 'kitchen' NOT NULL,
	"photo_url" text,
	"thumb_url" text,
	"available" boolean DEFAULT true NOT NULL,
	"sold_out_until" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"from_plan" "plan",
	"to_plan" "plan" NOT NULL,
	"from_status" "plan_status",
	"to_status" "plan_status" NOT NULL,
	"amount" integer,
	"method" text,
	"reference" text,
	"by_superadmin" text,
	"automatic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_parent_restaurant_id_restaurants_id_fk" FOREIGN KEY ("parent_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fortunes" ADD CONSTRAINT "fortunes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_options" ADD CONSTRAINT "menu_item_options_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_options" ADD CONSTRAINT "menu_item_options_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_restaurant_idx" ON "members" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_restaurant_user_uq" ON "members" USING btree ("restaurant_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "opening_hours_restaurant_idx" ON "opening_hours" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_slug_uq" ON "restaurants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "restaurants_parent_idx" ON "restaurants" USING btree ("parent_restaurant_id");--> statement-breakpoint
CREATE INDEX "areas_restaurant_idx" ON "areas" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "seats_restaurant_idx" ON "seats" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_qr_token_uq" ON "seats" USING btree ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_restaurant_type_label_uq" ON "seats" USING btree ("restaurant_id","type","label");--> statement-breakpoint
CREATE INDEX "fortunes_restaurant_idx" ON "fortunes" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_categories_restaurant_idx" ON "menu_categories" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_item_options_restaurant_idx" ON "menu_item_options" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_item_options_item_idx" ON "menu_item_options" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "menu_item_variants_restaurant_idx" ON "menu_item_variants" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_item_variants_item_idx" ON "menu_item_variants" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "menu_items_restaurant_idx" ON "menu_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "audit_log_restaurant_idx" ON "audit_log" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_events_restaurant_idx" ON "plan_events" USING btree ("restaurant_id");
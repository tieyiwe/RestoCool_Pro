CREATE TYPE "public"."order_item_status" AS ENUM('pending', 'preparing', 'ready', 'served', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('customer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('sent', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid,
	"variant_id" uuid,
	"code" text,
	"name_snapshot" jsonb NOT NULL,
	"variant_name" jsonb,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit_price" integer,
	"qty" smallint NOT NULL,
	"note" text,
	"station" "station" DEFAULT 'kitchen' NOT NULL,
	"status" "order_item_status" DEFAULT 'pending' NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid,
	"seat_id" uuid,
	"seat_type" "seat_type",
	"seat_label" text,
	"business_date" date NOT NULL,
	"number" integer NOT NULL,
	"source" "order_source" DEFAULT 'customer' NOT NULL,
	"customer_device_id" text,
	"customer_name" text,
	"customer_phone" text,
	"delivery_address" text,
	"status" "order_status" DEFAULT 'sent' NOT NULL,
	"validation_mode" text NOT NULL,
	"assigned_staff_id" uuid,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"has_on_request" boolean DEFAULT false NOT NULL,
	"note" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"served_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_restaurant_idx" ON "order_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_restaurant_status_idx" ON "orders" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "orders_session_idx" ON "orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "orders_device_idx" ON "orders" USING btree ("restaurant_id","customer_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_restaurant_day_number_uq" ON "orders" USING btree ("restaurant_id","business_date","number");
CREATE TABLE "shared_cart_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"name" text,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"host_device_hash" text NOT NULL,
	"host_name" text,
	"status" text DEFAULT 'open' NOT NULL,
	"order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_cart_members" ADD CONSTRAINT "shared_cart_members_cart_id_shared_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."shared_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_carts" ADD CONSTRAINT "shared_carts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_carts" ADD CONSTRAINT "shared_carts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_cart_members_uq" ON "shared_cart_members" USING btree ("cart_id","device_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_carts_token_uq" ON "shared_carts" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "shared_carts_host_idx" ON "shared_carts" USING btree ("restaurant_id","host_device_hash","status");
CREATE TYPE "public"."table_session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "session_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"customer_name" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"status" "table_session_status" DEFAULT 'open' NOT NULL,
	"source" text NOT NULL,
	"opened_by_device" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"closed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_devices_restaurant_idx" ON "session_devices" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_devices_session_device_uq" ON "session_devices" USING btree ("session_id","device_id");--> statement-breakpoint
CREATE INDEX "table_sessions_restaurant_idx" ON "table_sessions" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_one_open_per_seat" ON "table_sessions" USING btree ("seat_id") WHERE "table_sessions"."status" = 'open';
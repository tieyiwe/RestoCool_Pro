CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid,
	"business_name" text NOT NULL,
	"rc_code" text,
	"owner_email" text,
	"owner_name" text,
	"requested_by" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"contacted_at" timestamp with time zone,
	"contacted_by" text,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"admin_note" text,
	"was_published" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"restore_until" timestamp with time zone,
	"restored_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deletion_requests_status_idx" ON "deletion_requests" USING btree ("status","effective_at");--> statement-breakpoint
CREATE INDEX "deletion_requests_restaurant_idx" ON "deletion_requests" USING btree ("restaurant_id");
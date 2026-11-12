ALTER TABLE "members" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "archived_reason" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "erased_at" timestamp with time zone;
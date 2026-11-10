ALTER TABLE "restaurants" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "location_accuracy_m" integer;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "location_source" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "location_set_at" timestamp with time zone;
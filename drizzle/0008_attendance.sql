CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_out_at" timestamp with time zone,
	"in_method" text NOT NULL,
	"out_method" text,
	"in_by" uuid,
	"out_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "clerk_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "pin_failures" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_in_by_members_id_fk" FOREIGN KEY ("in_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_out_by_members_id_fk" FOREIGN KEY ("out_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_restaurant_idx" ON "attendance" USING btree ("restaurant_id","check_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_one_open_per_member" ON "attendance" USING btree ("member_id") WHERE "attendance"."check_out_at" is null;
CREATE TABLE "job_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"key" text,
	"name" text,
	"group" text DEFAULT 'front' NOT NULL,
	"access" text[] DEFAULT '{}' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "job_role_id" uuid;--> statement-breakpoint
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_roles_restaurant_idx" ON "job_roles" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_roles_restaurant_key_uq" ON "job_roles" USING btree ("restaurant_id","key");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_job_role_id_job_roles_id_fk" FOREIGN KEY ("job_role_id") REFERENCES "public"."job_roles"("id") ON DELETE set null ON UPDATE no action;
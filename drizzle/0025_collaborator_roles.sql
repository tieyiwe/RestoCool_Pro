ALTER TABLE "admin_collaborators" ADD COLUMN "role" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_collaborators" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_collaborators" ADD COLUMN "invite_status" text;--> statement-breakpoint
ALTER TABLE "admin_collaborators" ADD COLUMN "invite_count" integer DEFAULT 0 NOT NULL;
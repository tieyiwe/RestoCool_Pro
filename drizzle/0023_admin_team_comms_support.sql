CREATE TABLE "admin_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"perms" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"added_by" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_collaborators_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"day" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"last_path" text,
	"via" text DEFAULT 'account' NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_message_reads" (
	"message_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"link" text,
	"audience" jsonb NOT NULL,
	"popup" boolean DEFAULT false NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"emailed_count" integer DEFAULT 0 NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"request_id" uuid,
	"caller_name" text NOT NULL,
	"caller_phone" text,
	"checks" jsonb NOT NULL,
	"score" integer NOT NULL,
	"verified" boolean NOT NULL,
	"by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from" text NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "support_requests_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"restaurant_id" uuid,
	"member_id" uuid,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"contact" text,
	"rc_code" text,
	"category" text NOT NULL,
	"urgency" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"page_url" text,
	"user_agent" text,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to" text,
	"unread_for_business" boolean DEFAULT false NOT NULL,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_usage" ADD CONSTRAINT "app_usage_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_usage" ADD CONSTRAINT "app_usage_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_message_reads" ADD CONSTRAINT "platform_message_reads_message_id_platform_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."platform_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_message_reads" ADD CONSTRAINT "platform_message_reads_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_request_id_support_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."support_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_request_id_support_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."support_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_usage_member_day_uq" ON "app_usage" USING btree ("restaurant_id","member_id","day");--> statement-breakpoint
CREATE INDEX "app_usage_last_idx" ON "app_usage" USING btree ("last_at");--> statement-breakpoint
CREATE INDEX "app_usage_day_idx" ON "app_usage" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_message_reads_uq" ON "platform_message_reads" USING btree ("message_id","member_id");--> statement-breakpoint
CREATE INDEX "platform_messages_created_idx" ON "platform_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recovery_cases_restaurant_idx" ON "recovery_cases" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "support_messages_request_idx" ON "support_messages" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "support_requests_status_idx" ON "support_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "support_requests_restaurant_idx" ON "support_requests" USING btree ("restaurant_id","created_at");
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid,
	"order_ids" uuid[] NOT NULL,
	"seat_label" text,
	"seat_type" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"adjustment" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"discount_by" uuid,
	"total" integer DEFAULT 0 NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"business_date" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_amounts" CHECK ("bills"."subtotal" >= 0 and "bills"."adjustment" >= 0 and "bills"."discount" >= 0 and "bills"."paid" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid,
	"purpose" text NOT NULL,
	"purpose_id" uuid NOT NULL,
	"bill_id" uuid,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"provider" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_ref" text,
	"idempotency_key" text NOT NULL,
	"customer_phone" text,
	"return_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_amount" CHECK ("payment_intents"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"credentials_encrypted" text,
	"fee_percent" real DEFAULT 0 NOT NULL,
	"fee_fixed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"bill_id" uuid,
	"payment_intent_id" uuid,
	"session_id" uuid,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"received" integer,
	"change_given" integer,
	"reference" text,
	"split_label" text,
	"items" jsonb,
	"staff_id" uuid,
	"business_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_discount_by_members_id_fk" FOREIGN KEY ("discount_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "payment_provider_configs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_staff_id_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_restaurant_status_idx" ON "bills" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "bills_restaurant_day_idx" ON "bills" USING btree ("restaurant_id","business_date");--> statement-breakpoint
CREATE INDEX "bills_session_idx" ON "bills" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_idem_uq" ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_intents_restaurant_idx" ON "payment_intents" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_ref_uq" ON "payment_intents" USING btree ("provider","provider_ref") WHERE "payment_intents"."provider_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_configs_uq" ON "payment_provider_configs" USING btree ("restaurant_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_uq" ON "payment_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payments_restaurant_day_idx" ON "payments" USING btree ("restaurant_id","business_date");--> statement-breakpoint
CREATE INDEX "payments_bill_idx" ON "payments" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_intent_uq" ON "payments" USING btree ("payment_intent_id") WHERE "payments"."payment_intent_id" is not null;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_by_members_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
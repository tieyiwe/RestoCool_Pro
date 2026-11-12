CREATE TABLE "traffic_minutes" (
	"minute" timestamp with time zone NOT NULL,
	"audience" text NOT NULL,
	"device" text NOT NULL,
	"n" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_visitors" (
	"day" date NOT NULL,
	"visitor" text NOT NULL,
	"audience" text NOT NULL,
	"device" text NOT NULL,
	"os" text NOT NULL,
	"standalone" boolean DEFAULT false NOT NULL,
	"restaurant_id" uuid
);
--> statement-breakpoint
ALTER TABLE "traffic_visitors" ADD CONSTRAINT "traffic_visitors_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_minutes_uq" ON "traffic_minutes" USING btree ("minute","audience","device");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_visitors_uq" ON "traffic_visitors" USING btree ("day","visitor","audience");--> statement-breakpoint
CREATE INDEX "traffic_visitors_restaurant_idx" ON "traffic_visitors" USING btree ("restaurant_id","day");
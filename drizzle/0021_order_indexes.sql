CREATE INDEX "orders_restaurant_sent_idx" ON "orders" USING btree ("restaurant_id","sent_at");--> statement-breakpoint
CREATE INDEX "orders_trip_idx" ON "orders" USING btree ("trip_id");
ALTER TABLE "orders" ADD COLUMN "code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_restaurant_code_uq" ON "orders" USING btree ("restaurant_id","code") WHERE "orders"."code" is not null;--> statement-breakpoint
-- Existing orders get their full number too (initials from the business's web address, accents already removed).
WITH words AS (
	SELECT r.id, w.word, w.ord
	FROM restaurants r, regexp_split_to_table(r.slug, '-') WITH ORDINALITY AS w(word, ord)
	WHERE w.word <> '' AND (w.ord = (SELECT count(*) FROM regexp_split_to_table(r.slug, '-')) OR w.word NOT IN ('le','la','les','l','de','du','des','d','et','chez','au','aux','a','the'))
), prefixes AS (
	SELECT id, CASE WHEN count(*) = 1 THEN upper(left(min(word), 2)) ELSE upper(string_agg(left(word, 1), '' ORDER BY ord) FILTER (WHERE ord IS NOT NULL)) END AS raw
	FROM words GROUP BY id
)
UPDATE "orders" o SET "code" = left(p.raw, CASE WHEN length(p.raw) > 3 THEN 3 ELSE length(p.raw) END) || '-' || to_char(o.business_date, 'YYMMDD') || '-' || lpad(o.number::text, 3, '0')
FROM prefixes p WHERE p.id = o.restaurant_id AND o."code" IS NULL;

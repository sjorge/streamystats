-- Create people table
CREATE TABLE "people" (
	"id" text NOT NULL,
	"server_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"primary_image_tag" text,
	"search_vector" "tsvector",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "people_id_server_id_pk" PRIMARY KEY("id","server_id")
);
--> statement-breakpoint

-- Create item_people junction table
CREATE TABLE "item_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"person_id" text NOT NULL,
	"server_id" integer NOT NULL,
	"role" text,
	"sort_order" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_people_unique" UNIQUE("item_id","person_id")
);
--> statement-breakpoint

-- Add foreign keys for people table
ALTER TABLE "people" ADD CONSTRAINT "people_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add foreign keys for item_people table
ALTER TABLE "item_people" ADD CONSTRAINT "item_people_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_people" ADD CONSTRAINT "item_people_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Create indexes for item_people
CREATE INDEX "item_people_person_idx" ON "item_people" USING btree ("person_id","server_id");
--> statement-breakpoint
CREATE INDEX "item_people_item_idx" ON "item_people" USING btree ("item_id");
--> statement-breakpoint

-- Create indexes for people (with proper trigram operator class)
CREATE INDEX "people_name_trgm_idx" ON "people" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "people_search_vector_idx" ON "people" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "people_server_id_idx" ON "people" USING btree ("server_id");
--> statement-breakpoint
CREATE INDEX "people_type_idx" ON "people" USING btree ("server_id","type");
--> statement-breakpoint

-- Create trigger function for people search vector
CREATE OR REPLACE FUNCTION people_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.name, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER people_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name ON people
  FOR EACH ROW EXECUTE FUNCTION people_search_vector_update();
--> statement-breakpoint

-- Backfill people table from existing items.people JSONB
-- This must happen BEFORE we drop the column
INSERT INTO people (id, server_id, name, type, primary_image_tag, created_at, updated_at)
SELECT DISTINCT ON (person->>'Id', i.server_id)
  person->>'Id' as id,
  i.server_id,
  person->>'Name' as name,
  COALESCE(person->>'Type', 'Unknown') as type,
  person->>'PrimaryImageTag' as primary_image_tag,
  NOW() as created_at,
  NOW() as updated_at
FROM items i,
  jsonb_array_elements(i.people) as person
WHERE i.people IS NOT NULL
  AND jsonb_typeof(i.people) = 'array'
  AND person->>'Id' IS NOT NULL
  AND person->>'Name' IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill item_people junction table
INSERT INTO item_people (item_id, person_id, server_id, role, sort_order, created_at)
SELECT
  i.id as item_id,
  person->>'Id' as person_id,
  i.server_id,
  person->>'Role' as role,
  (idx - 1) as sort_order,
  NOW() as created_at
FROM items i,
  jsonb_array_elements(i.people) WITH ORDINALITY AS arr(person, idx)
WHERE i.people IS NOT NULL
  AND jsonb_typeof(i.people) = 'array'
  AND person->>'Id' IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Populate search vectors for all backfilled people
UPDATE people SET search_vector = to_tsvector('english', COALESCE(name, ''))
WHERE search_vector IS NULL;
--> statement-breakpoint

-- Drop the old items search vector trigger (it depends on the people column)
DROP TRIGGER IF EXISTS items_search_vector_trigger ON items;
--> statement-breakpoint

-- Update items search vector trigger function to remove people references
-- (People are now in a separate table, so the items trigger no longer needs to include them)
CREATE OR REPLACE FUNCTION items_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.original_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.series_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.genres, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Recreate the items search vector trigger without the people column
CREATE TRIGGER items_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, original_title, overview, series_name, genres
  ON items
  FOR EACH ROW
  EXECUTE FUNCTION items_search_vector_update();
--> statement-breakpoint

-- Now drop the people column from items
ALTER TABLE "items" DROP COLUMN "people";

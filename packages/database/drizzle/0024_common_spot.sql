-- Enable pg_trgm extension for fuzzy matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

ALTER TABLE "activities" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint

CREATE INDEX "activities_server_id_idx" ON "activities" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "activities_search_vector_idx" ON "activities" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "items_search_vector_idx" ON "items" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "users_server_id_idx" ON "users" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "users_search_vector_idx" ON "users" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "watchlists_search_vector_idx" ON "watchlists" USING gin ("search_vector");--> statement-breakpoint

-- Create trigger function for items search vector
-- Includes: name, originalTitle, overview, seriesName, genres, and people (actors/directors)
CREATE OR REPLACE FUNCTION items_search_vector_update() RETURNS trigger AS $$
DECLARE
  people_text TEXT := '';
  people_record RECORD;
BEGIN
  -- Extract people names from JSONB only if it's an object
  IF NEW.people IS NOT NULL AND jsonb_typeof(NEW.people) = 'object' THEN
    FOR people_record IN 
      SELECT value->>'Name' as name, value->>'Type' as type, value->>'Role' as role
      FROM jsonb_each(NEW.people)
      WHERE value->>'Name' IS NOT NULL
    LOOP
      people_text := people_text || ' ' || people_record.name;
      IF people_record.role IS NOT NULL AND people_record.role != '' THEN
        people_text := people_text || ' ' || people_record.role;
      END IF;
    END LOOP;
  END IF;

  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.original_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.series_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.genres, ' '), '')), 'B') ||
    setweight(to_tsvector('english', people_text), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER items_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, original_title, overview, series_name, genres, people
  ON items
  FOR EACH ROW
  EXECUTE FUNCTION items_search_vector_update();--> statement-breakpoint

-- Create trigger function for users search vector
CREATE OR REPLACE FUNCTION users_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.name, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER users_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION users_search_vector_update();--> statement-breakpoint

-- Create trigger function for activities search vector
CREATE OR REPLACE FUNCTION activities_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.short_overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.type, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER activities_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, short_overview, type
  ON activities
  FOR EACH ROW
  EXECUTE FUNCTION activities_search_vector_update();--> statement-breakpoint

-- Create trigger function for watchlists search vector
CREATE OR REPLACE FUNCTION watchlists_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER watchlists_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description
  ON watchlists
  FOR EACH ROW
  EXECUTE FUNCTION watchlists_search_vector_update();--> statement-breakpoint

-- Populate search vectors for existing data
-- Users (simple, do first)
UPDATE users SET search_vector = to_tsvector('english', COALESCE(name, ''))
WHERE search_vector IS NULL;--> statement-breakpoint

-- Activities
UPDATE activities SET 
  search_vector = 
    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(short_overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(type, '')), 'C')
WHERE search_vector IS NULL;--> statement-breakpoint

-- Watchlists
UPDATE watchlists SET 
  search_vector = 
    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'B')
WHERE search_vector IS NULL;--> statement-breakpoint

-- Items (handles null/non-object people gracefully)
UPDATE items SET 
  search_vector = 
    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(original_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(series_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(overview, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(genres, ' '), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(
      CASE 
        WHEN people IS NOT NULL AND jsonb_typeof(people) = 'object' THEN
          (SELECT string_agg(COALESCE(value->>'Name', '') || ' ' || COALESCE(value->>'Role', ''), ' ')
           FROM jsonb_each(people)
           WHERE value->>'Name' IS NOT NULL)
        ELSE ''
      END, ''
    )), 'C')
WHERE search_vector IS NULL;

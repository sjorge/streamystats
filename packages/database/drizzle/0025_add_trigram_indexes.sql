-- Add GIN trigram indexes for fast fuzzy search
-- These indexes enable the %>, %, and similarity operators to use index scans

-- Ensure pg_trgm extension is enabled (should already exist from previous migration)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index on items.name for fuzzy title search
CREATE INDEX IF NOT EXISTS items_name_trgm_idx 
ON items USING GIN (name gin_trgm_ops);

-- Index on items.series_name for episode/season searches  
CREATE INDEX IF NOT EXISTS items_series_name_trgm_idx 
ON items USING GIN (series_name gin_trgm_ops);

-- Index on items.original_title for alternative title searches
CREATE INDEX IF NOT EXISTS items_original_title_trgm_idx 
ON items USING GIN (original_title gin_trgm_ops);

-- Index on users.name for user searches
CREATE INDEX IF NOT EXISTS users_name_trgm_idx 
ON users USING GIN (name gin_trgm_ops);

-- Index on watchlists.name for watchlist searches
CREATE INDEX IF NOT EXISTS watchlists_name_trgm_idx 
ON watchlists USING GIN (name gin_trgm_ops);

-- Index on activities.name for activity searches
CREATE INDEX IF NOT EXISTS activities_name_trgm_idx 
ON activities USING GIN (name gin_trgm_ops);

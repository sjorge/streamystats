-- Migration: Move type from people table to item_people table
-- This fixes the bug where a person can only have one role globally,
-- when in reality they can be Actor in one movie and Director in another.

-- Step 1: Drop the old unique constraint (will be replaced with new one including type)
ALTER TABLE "item_people" DROP CONSTRAINT "item_people_unique";--> statement-breakpoint

-- Step 2: Add type column to item_people (nullable initially for data migration)
ALTER TABLE "item_people" ADD COLUMN "type" text;--> statement-breakpoint

-- Step 3: Backfill type from people table to item_people
UPDATE "item_people" ip
SET "type" = p."type"
FROM "people" p
WHERE ip."person_id" = p."id" AND ip."server_id" = p."server_id";--> statement-breakpoint

-- Step 4: Set default for any rows that couldn't be matched (shouldn't happen, but safety)
UPDATE "item_people"
SET "type" = 'Unknown'
WHERE "type" IS NULL;--> statement-breakpoint

-- Step 5: Make type column NOT NULL now that data is migrated
ALTER TABLE "item_people" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint

-- Step 6: Drop the type index and column from people table
DROP INDEX "people_type_idx";--> statement-breakpoint
ALTER TABLE "people" DROP COLUMN "type";--> statement-breakpoint

-- Step 7: Add new indexes
CREATE INDEX "item_people_type_idx" ON "item_people" USING btree ("server_id","type");--> statement-breakpoint

-- Step 8: Add new unique constraint including type
-- This allows same person to be both Actor AND Director in the same item
ALTER TABLE "item_people" ADD CONSTRAINT "item_people_unique" UNIQUE("item_id","person_id","type");

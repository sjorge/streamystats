-- Add deleted_at column to items table for soft delete functionality
ALTER TABLE "items" ADD COLUMN "deleted_at" timestamp with time zone;

-- Create index for efficient filtering of non-deleted items
CREATE INDEX "items_deleted_at_idx" ON "items" ("deleted_at") WHERE "deleted_at" IS NULL;


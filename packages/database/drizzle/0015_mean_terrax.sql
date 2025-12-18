ALTER TABLE "user_fingerprints" ADD COLUMN "hour_histogram" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_fingerprints" DROP COLUMN "typical_hours_utc";
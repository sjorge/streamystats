ALTER TABLE "servers" ADD COLUMN "excluded_user_ids" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "excluded_library_ids" text[] DEFAULT '{}';
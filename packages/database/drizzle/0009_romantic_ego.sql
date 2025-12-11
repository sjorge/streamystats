DROP INDEX "items_embedding_idx";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "embedding" SET DATA TYPE vector;--> statement-breakpoint
ALTER TABLE "servers" ALTER COLUMN "embedding_provider" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "embedding_base_url" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "embedding_api_key" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "embedding_dimensions" integer DEFAULT 1536;--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "open_ai_api_token";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "ollama_api_token";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "ollama_base_url";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "ollama_model";
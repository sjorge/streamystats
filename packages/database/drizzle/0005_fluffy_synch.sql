-- Update existing null values to 'openai' before adding default
UPDATE "servers" SET "embedding_provider" = 'openai' WHERE "embedding_provider" IS NULL;

ALTER TABLE "servers" ALTER COLUMN "embedding_provider" SET DEFAULT 'openai';
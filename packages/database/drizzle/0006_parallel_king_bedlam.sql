-- First, update the 'name' column with values from 'server_name' where 'name' is null or empty
UPDATE "servers" 
SET "name" = "server_name" 
WHERE "server_name" IS NOT NULL;

-- Then drop the server_name column
ALTER TABLE "servers" DROP COLUMN "server_name";
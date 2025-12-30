ALTER TABLE "items" ADD COLUMN "people_synced" boolean DEFAULT false;

-- Mark items that already have people records as synced
UPDATE "items" SET "people_synced" = true
WHERE EXISTS (
    SELECT 1 FROM "item_people" ip
    WHERE ip.item_id = items.id
    AND ip.server_id = items.server_id
);
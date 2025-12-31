CREATE TABLE "media_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"server_id" integer NOT NULL,
	"size" bigint,
	"bitrate" integer,
	"container" text,
	"name" text,
	"path" text,
	"is_remote" boolean,
	"runtime_ticks" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sources" ADD CONSTRAINT "media_sources_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_sources_item_id_idx" ON "media_sources" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "media_sources_server_id_idx" ON "media_sources" USING btree ("server_id");--> statement-breakpoint
-- Data migration: Extract MediaSources from items.raw_data into new table
INSERT INTO media_sources (id, item_id, server_id, size, bitrate, container, name, path, is_remote, runtime_ticks, created_at, updated_at)
SELECT
  COALESCE(ms->>'Id', items.id || '-' || (ROW_NUMBER() OVER (PARTITION BY items.id ORDER BY (ms->>'Size')::bigint DESC NULLS LAST))::text) as id,
  items.id as item_id,
  items.server_id,
  (ms->>'Size')::bigint as size,
  (ms->>'Bitrate')::integer as bitrate,
  ms->>'Container' as container,
  ms->>'Name' as name,
  ms->>'Path' as path,
  (ms->>'IsRemote')::boolean as is_remote,
  (ms->>'RunTimeTicks')::bigint as runtime_ticks,
  NOW(),
  NOW()
FROM items
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN raw_data->'MediaSources' IS NOT NULL
    AND jsonb_typeof(raw_data->'MediaSources') = 'array'
    AND jsonb_array_length(raw_data->'MediaSources') > 0
    THEN raw_data->'MediaSources'
    ELSE '[]'::jsonb
  END
) AS ms
WHERE items.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;
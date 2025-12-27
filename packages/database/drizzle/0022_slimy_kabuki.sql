CREATE TABLE "active_sessions" (
	"server_id" integer NOT NULL,
	"session_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "active_sessions_server_id_session_key_pk" PRIMARY KEY("server_id","session_key")
);
--> statement-breakpoint
CREATE TABLE "activity_log_cursors" (
	"server_id" integer PRIMARY KEY NOT NULL,
	"cursor_date" timestamp with time zone,
	"cursor_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log_cursors" ADD CONSTRAINT "activity_log_cursors_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_sessions_server_last_seen_idx" ON "active_sessions" USING btree ("server_id","last_seen_at");
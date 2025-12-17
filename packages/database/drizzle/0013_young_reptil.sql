CREATE TABLE "anomaly_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"server_id" integer NOT NULL,
	"session_id" text,
	"anomaly_type" text NOT NULL,
	"severity" text NOT NULL,
	"details" jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"ip_address" text NOT NULL,
	"country_code" text,
	"country" text,
	"region" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"is_private_ip" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"server_id" integer NOT NULL,
	"known_device_ids" jsonb DEFAULT '[]'::jsonb,
	"known_countries" jsonb DEFAULT '[]'::jsonb,
	"known_cities" jsonb DEFAULT '[]'::jsonb,
	"known_clients" jsonb DEFAULT '[]'::jsonb,
	"location_patterns" jsonb DEFAULT '[]'::jsonb,
	"device_patterns" jsonb DEFAULT '[]'::jsonb,
	"typical_hours_utc" jsonb DEFAULT '[]'::jsonb,
	"avg_sessions_per_day" double precision,
	"total_sessions" integer DEFAULT 0,
	"last_calculated_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_fingerprints_user_server_unique" UNIQUE("user_id","server_id")
);
--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_locations" ADD CONSTRAINT "session_locations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fingerprints" ADD CONSTRAINT "user_fingerprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_fingerprints" ADD CONSTRAINT "user_fingerprints_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anomaly_events_user_id_idx" ON "anomaly_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anomaly_events_server_id_idx" ON "anomaly_events" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "anomaly_events_session_id_idx" ON "anomaly_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "anomaly_events_anomaly_type_idx" ON "anomaly_events" USING btree ("anomaly_type");--> statement-breakpoint
CREATE INDEX "anomaly_events_resolved_idx" ON "anomaly_events" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "session_locations_session_id_idx" ON "session_locations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_locations_ip_address_idx" ON "session_locations" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "user_fingerprints_user_id_idx" ON "user_fingerprints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_fingerprints_server_id_idx" ON "user_fingerprints" USING btree ("server_id");
CREATE TABLE "activity_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
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
ALTER TABLE "session_locations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "session_locations" CASCADE;--> statement-breakpoint
ALTER TABLE "anomaly_events" DROP CONSTRAINT "anomaly_events_session_id_sessions_id_fk";
--> statement-breakpoint
DROP INDEX "anomaly_events_session_id_idx";--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "activity_locations" ADD CONSTRAINT "activity_locations_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_locations_activity_id_idx" ON "activity_locations" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "activity_locations_ip_address_idx" ON "activity_locations" USING btree ("ip_address");--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anomaly_events_activity_id_idx" ON "anomaly_events" USING btree ("activity_id");--> statement-breakpoint
ALTER TABLE "anomaly_events" DROP COLUMN "session_id";
CREATE TABLE "server_job_configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"job_key" text NOT NULL,
	"cron_expression" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "server_job_config_unique" UNIQUE("server_id","job_key")
);
--> statement-breakpoint
ALTER TABLE "server_job_configurations" ADD CONSTRAINT "server_job_configurations_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_job_config_server_idx" ON "server_job_configurations" USING btree ("server_id");
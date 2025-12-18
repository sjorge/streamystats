CREATE INDEX "items_server_type_idx" ON "items" USING btree ("server_id","type");--> statement-breakpoint
CREATE INDEX "items_series_id_idx" ON "items" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "sessions_server_user_idx" ON "sessions" USING btree ("server_id","user_id");--> statement-breakpoint
CREATE INDEX "sessions_server_item_idx" ON "sessions" USING btree ("server_id","item_id");--> statement-breakpoint
CREATE INDEX "sessions_server_created_at_idx" ON "sessions" USING btree ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_server_start_time_idx" ON "sessions" USING btree ("server_id","start_time");--> statement-breakpoint
CREATE INDEX "sessions_user_start_time_idx" ON "sessions" USING btree ("user_id","start_time");
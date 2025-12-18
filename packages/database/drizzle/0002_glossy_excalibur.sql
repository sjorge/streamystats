ALTER TABLE "sessions" RENAME COLUMN "transcoding_reasons" TO "transcode_reasons";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_is_video_direct" boolean;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_is_audio_direct" boolean;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_bitrate" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_completion_percentage" double precision;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_audio_channels" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_hardware_acceleration_type" text;
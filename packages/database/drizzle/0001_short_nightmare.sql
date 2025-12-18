ALTER TABLE "sessions" ADD COLUMN "video_codec" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "audio_codec" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "resolution_width" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "resolution_height" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "video_bit_rate" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "audio_bit_rate" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "audio_channels" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "audio_sample_rate" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "video_range_type" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_transcoded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "transcoding_reasons" text[];--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "transcoding_is_video_direct";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "transcoding_is_audio_direct";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "transcoding_bitrate";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "transcoding_completion_percentage";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "transcoding_audio_channels";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "transcoding_hardware_acceleration_type";
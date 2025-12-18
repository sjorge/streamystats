export interface LegacySessionData {
  id: string;
  user_jellyfin_id: string;
  device_id: string;
  device_name: string;
  client_name: string;
  item_jellyfin_id: string;
  item_name: string;
  series_jellyfin_id?: string | null;
  series_name?: string | null;
  season_jellyfin_id?: string | null;
  play_duration: string; // in seconds as string
  play_method: string;
  start_time: string; // ISO timestamp
  end_time: string; // ISO timestamp
  position_ticks: string; // as string
  runtime_ticks?: string | null; // as string
  percent_complete: number;
  completed: string; // "true" or "false" as string
  server_id: string;
  is_paused?: string | null;
  is_muted?: string | null;
  volume_level?: string | null;
  audio_stream_index?: string | null;
  subtitle_stream_index?: string | null;
  media_source_id?: string | null;
  repeat_mode?: string | null;
  playback_order?: string | null;
  remote_end_point?: string | null;
  session_id?: string | null;
  user_name?: string | null;
  last_activity_date?: string | null;
  last_playback_check_in?: string | null;
  application_version?: string | null;
  is_active?: string | null;
  transcoding_audio_codec?: string | null;
  transcoding_video_codec?: string | null;
  transcoding_container?: string | null;
  transcoding_is_video_direct?: string | null;
  transcoding_is_audio_direct?: string | null;
  transcoding_bitrate?: string | null;
  transcoding_completion_percentage?: string | null;
  transcoding_width?: string | null;
  transcoding_height?: string | null;
  transcoding_audio_channels?: string | null;
  transcoding_hardware_acceleration_type?: string | null;
  transcoding_reasons?: string | null;
  inserted_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

export interface LegacyImportState {
  type: "success" | "error" | "info" | null;
  message: string;
  imported_count?: number;
  total_count?: number;
  error_count?: number;
}

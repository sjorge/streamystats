"use server";

import { db } from "@streamystats/database";
import { type NewSession, sessions } from "@streamystats/database/schema";
import {
  type LegacyImportState,
  type LegacySessionData,
} from "./types/legacy-import";

export async function importFromLegacy(
  prevState: LegacyImportState,
  formData: FormData,
): Promise<LegacyImportState> {
  try {
    const serverId = formData.get("serverId");
    const file = formData.get("file") as File;

    if (!serverId || !file) {
      return {
        type: "error",
        message: "Server ID and file are required",
      };
    }

    const serverIdNum = Number(serverId);
    if (Number.isNaN(serverIdNum)) {
      return {
        type: "error",
        message: "Invalid server ID",
      };
    }

    const text = await file.text();
    let data: LegacySessionData[];

    try {
      data = JSON.parse(text);
    } catch {
      return {
        type: "error",
        message: "Invalid JSON file",
      };
    }

    // Validate data format
    if (!Array.isArray(data)) {
      return {
        type: "error",
        message: "Expected an array of legacy session objects",
      };
    }

    const validationResult = validateLegacyData(data);
    if (!validationResult.isValid) {
      return {
        type: "error",
        message: validationResult.error || "Invalid data format",
      };
    }

    // Process import
    let importedCount = 0;
    const totalCount = data.length;
    let errorCount = 0;

    for (const legacySession of data) {
      try {
        const imported = await importLegacySession(legacySession, serverIdNum);
        if (imported) {
          importedCount++;
        }
      } catch (error) {
        console.error(
          `Failed to import legacy session ${legacySession.id}:`,
          error,
        );
        errorCount++;
        // Continue with other sessions
      }
    }

    return {
      type: "success",
      message: `Successfully imported ${importedCount} of ${totalCount} sessions from legacy database`,
      imported_count: importedCount,
      total_count: totalCount,
      error_count: errorCount,
    };
  } catch (error) {
    return {
      type: "error",
      message: error instanceof Error ? error.message : "Import failed",
    };
  }
}

async function importLegacySession(
  legacySession: LegacySessionData,
  serverId: number,
): Promise<boolean> {
  // Validate required fields
  if (
    !legacySession.id ||
    !legacySession.user_jellyfin_id ||
    !legacySession.item_jellyfin_id
  ) {
    throw new Error("Missing required session fields");
  }

  // Parse numeric and boolean values from strings
  const playDuration = Number.parseInt(legacySession.play_duration) || 0;
  const positionTicks = Number.parseInt(legacySession.position_ticks) || 0;
  const runtimeTicks = legacySession.runtime_ticks
    ? Number.parseInt(legacySession.runtime_ticks)
    : null;
  const completed = legacySession.completed === "true";
  const percentComplete = legacySession.percent_complete || 0;

  // Parse optional numeric fields
  const volumeLevel = legacySession.volume_level
    ? Number.parseInt(legacySession.volume_level)
    : null;
  const audioStreamIndex = legacySession.audio_stream_index
    ? Number.parseInt(legacySession.audio_stream_index)
    : null;
  const subtitleStreamIndex = legacySession.subtitle_stream_index
    ? Number.parseInt(legacySession.subtitle_stream_index)
    : null;

  // Parse transcoding fields (only those that exist in schema)
  const transcodingWidth = legacySession.transcoding_width
    ? Number.parseInt(legacySession.transcoding_width)
    : null;
  const transcodingHeight = legacySession.transcoding_height
    ? Number.parseInt(legacySession.transcoding_height)
    : null;

  // Parse boolean fields
  const isPaused = legacySession.is_paused === "true";
  const isMuted = legacySession.is_muted === "true";
  const isActive = legacySession.is_active !== "false"; // Default to true unless explicitly false

  // Determine if transcoding occurred based on available transcoding info
  const isTranscoded = !!(
    legacySession.transcoding_video_codec ||
    legacySession.transcoding_audio_codec ||
    legacySession.transcoding_container ||
    legacySession.play_method !== "DirectPlay"
  );

  // Parse dates
  const startTime = new Date(legacySession.start_time);
  const endTime = new Date(legacySession.end_time);
  const lastActivityDate = legacySession.last_activity_date
    ? new Date(legacySession.last_activity_date)
    : null;
  const lastPlaybackCheckIn = legacySession.last_playback_check_in
    ? new Date(legacySession.last_playback_check_in)
    : null;
  const insertedAt = new Date(legacySession.inserted_at);

  // Prepare transcoding reasons array
  const transcodingReasons = legacySession.transcoding_reasons
    ? [legacySession.transcoding_reasons]
    : null;

  // Insert session
  const sessionData: NewSession = {
    id: legacySession.id,
    serverId: serverId,
    userId: legacySession.user_jellyfin_id,
    itemId: legacySession.item_jellyfin_id,
    userName: legacySession.user_name || "Unknown User",
    userServerId: legacySession.user_jellyfin_id,
    itemName: legacySession.item_name,
    clientName: legacySession.client_name,
    deviceName: legacySession.device_name,
    deviceId: legacySession.device_id,
    applicationVersion: legacySession.application_version,
    playMethod: legacySession.play_method,
    playDuration: playDuration,
    remoteEndPoint: legacySession.remote_end_point,

    // Series/Season information
    seriesId: legacySession.series_jellyfin_id,
    seriesName: legacySession.series_name,
    seasonId: legacySession.season_jellyfin_id,

    // Timing information
    startTime: startTime,
    endTime: endTime,
    lastActivityDate: lastActivityDate,
    lastPlaybackCheckIn: lastPlaybackCheckIn,

    // Playback position and runtime
    positionTicks: positionTicks,
    runtimeTicks: runtimeTicks,
    percentComplete: percentComplete,

    // Playback state
    completed: completed,
    isPaused: isPaused,
    isMuted: isMuted,
    isActive: isActive,

    // Audio/Video settings
    volumeLevel: volumeLevel,
    audioStreamIndex: audioStreamIndex,
    subtitleStreamIndex: subtitleStreamIndex,
    mediaSourceId: legacySession.media_source_id,
    repeatMode: legacySession.repeat_mode,
    playbackOrder: legacySession.playback_order,

    // Media stream information (legacy data doesn't have these, set to null)
    videoCodec: null,
    audioCodec: null,
    resolutionWidth: null,
    resolutionHeight: null,
    videoBitRate: null,
    audioBitRate: null,
    audioChannels: null,
    audioSampleRate: null,
    videoRangeType: null,

    // Transcoding information (only valid schema fields)
    isTranscoded: isTranscoded,
    transcodingWidth: transcodingWidth,
    transcodingHeight: transcodingHeight,
    transcodingVideoCodec: legacySession.transcoding_video_codec,
    transcodingAudioCodec: legacySession.transcoding_audio_codec,
    transcodingContainer: legacySession.transcoding_container,
    transcodeReasons: transcodingReasons,

    // Complete session data for future reference
    rawData: legacySession,
    createdAt: insertedAt,
    updatedAt: new Date(legacySession.updated_at),
  };

  await db.insert(sessions).values(sessionData).onConflictDoNothing();
  return true;
}

function validateLegacyData(data: any): {
  isValid: boolean;
  error?: string;
} {
  if (!Array.isArray(data)) {
    return { isValid: false, error: "Data must be an array" };
  }

  if (data.length === 0) {
    return { isValid: false, error: "Data array is empty" };
  }

  // Check first few items for required fields
  const sampleSize = Math.min(5, data.length);
  const requiredFields = [
    "id",
    "user_jellyfin_id",
    "item_jellyfin_id",
    "item_name",
    "play_duration",
    "start_time",
    "end_time",
    "inserted_at",
  ];

  for (let i = 0; i < sampleSize; i++) {
    const session = data[i];

    if (typeof session !== "object" || session === null) {
      return { isValid: false, error: `Invalid session object at index ${i}` };
    }

    for (const field of requiredFields) {
      if (!(field in session)) {
        return {
          isValid: false,
          error: `Missing required field "${field}" in session at index ${i}`,
        };
      }
    }

    // Validate date format
    if (session.start_time && Number.isNaN(Date.parse(session.start_time))) {
      return {
        isValid: false,
        error: `Invalid date format for start_time at index ${i}`,
      };
    }

    if (session.end_time && Number.isNaN(Date.parse(session.end_time))) {
      return {
        isValid: false,
        error: `Invalid date format for end_time at index ${i}`,
      };
    }

    if (session.inserted_at && Number.isNaN(Date.parse(session.inserted_at))) {
      return {
        isValid: false,
        error: `Invalid date format for inserted_at at index ${i}`,
      };
    }

    // Validate duration is a valid number string
    if (session.play_duration && Number.isNaN(Number(session.play_duration))) {
      return {
        isValid: false,
        error: `Invalid play_duration format at index ${i}`,
      };
    }
  }

  return { isValid: true };
}

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { requireAdmin } from "@/lib/api-auth";
import type { LegacySessionData } from "@/lib/types/legacy-import";
import { db } from "@streamystats/database";
import { sessions } from "@streamystats/database/schema";
import type { NewSession } from "@streamystats/database/schema";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
// @ts-ignore - stream-json doesn't have types
import { parser } from "stream-json";
// @ts-ignore - stream-json doesn't have types
import { streamArray } from "stream-json/streamers/StreamArray";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    // Require admin for data import
    const { error } = await requireAdmin();
    if (error) return error;

    const url = new URL(req.url);
    const serverId = url.searchParams.get("serverId");

    if (!serverId) {
      return NextResponse.json(
        { error: "Server ID is required" },
        { status: 400 },
      );
    }

    const serverIdNum = Number(serverId);
    if (Number.isNaN(serverIdNum)) {
      return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
    }

    if (!req.body) {
      return NextResponse.json({ error: "No body provided" }, { status: 400 });
    }

    const input = Readable.fromWeb(
      req.body as import("stream/web").ReadableStream,
    );
    let processedCount = 0;
    let importedCount = 0;
    let errorCount = 0;

    await pipeline(
      input,
      parser(),
      streamArray(),
      async (records: AsyncIterable<{ value: unknown }>) => {
        for await (const { value } of records) {
          try {
            const imported = await importLegacySession(
              value as LegacySessionData,
              serverIdNum,
            );
            if (imported) {
              importedCount++;
            }
            processedCount++;
          } catch (error) {
            console.error("Failed to import legacy session:", error);
            errorCount++;
            processedCount++;
          }
        }
      },
    );

    if (processedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid sessions found. Please check the file format.",
          message: "Import failed - no sessions found",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${importedCount} of ${processedCount} sessions from legacy database`,
      imported_count: importedCount,
      total_count: processedCount,
      error_count: errorCount,
    });
  } catch (error) {
    console.error("Legacy import error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
        success: false,
      },
      { status: 500 },
    );
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

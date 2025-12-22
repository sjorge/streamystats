"use server";

import { randomUUID } from "node:crypto";
import { db } from "@streamystats/database";
import {
  items,
  type NewSession,
  sessions,
  users,
} from "@streamystats/database/schema";
import { eq } from "drizzle-orm";

// =============================================================================
// Constants
// =============================================================================

const INT32_MIN = -2147483648;
const HEX32 = /^[0-9a-f]{32}$/i;

// =============================================================================
// Types
// =============================================================================

export interface ImportState {
  type: "success" | "error" | "info" | null;
  message: string;
  importedCount?: number;
  totalCount?: number;
  errorCount?: number;
}

export type ItemType = "Movie" | "Episode" | (string & {});
export type PlayMode = "DirectPlay" | "DirectStream" | "Transcode" | "Other";
export type PositionKind = "seconds" | "milliseconds" | "invalid";

export interface PlayMethodParsed {
  mode: PlayMode;
  video?: string;
  audio?: string;
}

export interface PlaybackRow {
  timestampRaw: string;
  timestampMs?: number;
  userId: string;
  itemId: string;
  itemType: ItemType;
  itemName: string;
  itemNameRaw: string;
  playMethodRaw: string;
  play: PlayMethodParsed;
  client: string;
  deviceName: string;
  positionSeconds?: number;
  positionSecondsRaw: number;
  positionKind: PositionKind;
}

export interface EpisodeInfo {
  seriesName: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

// Internal interface for DB mapping (kept for compatibility)
interface PlaybackReportingData {
  timestamp: string;
  userId?: string;
  itemId?: string;
  itemType?: string;
  itemName?: string;
  playMethod?: string;
  clientName?: string;
  deviceName?: string;
  durationSeconds?: number;
}

// =============================================================================
// Pure Parsing Functions
// =============================================================================

/**
 * Parse .NET-style timestamp with variable fractional precision (0-7 digits).
 * Format: "YYYY-MM-DD HH:mm:ss.fffffff"
 * Returns milliseconds since epoch or undefined if invalid.
 */
export function parseDotNetTimestamp(raw: string): number | undefined {
  const s = raw.trim();
  const spaceIdx = s.indexOf(" ");
  if (spaceIdx < 0) return undefined;

  const datePart = s.slice(0, spaceIdx);
  const timePart = s.slice(spaceIdx + 1);

  const dateParts = datePart.split("-");
  if (dateParts.length !== 3) return undefined;

  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);

  const [timeOnly, frac] = timePart.split(".");
  const timeParts = timeOnly.split(":");
  if (timeParts.length !== 3) return undefined;

  const hours = Number(timeParts[0]);
  const minutes = Number(timeParts[1]);
  const seconds = Number(timeParts[2]);

  // Convert fractional part to milliseconds (pad/truncate to 3 digits)
  const fracStr = (frac ?? "").trim();
  const msStr = (fracStr + "000").slice(0, 3);
  const ms = Number(msStr);

  const dt = new Date(year, month - 1, day, hours, minutes, seconds, ms);
  const result = dt.getTime();
  return Number.isFinite(result) ? result : undefined;
}

/**
 * Parse play method string into structured object.
 * Handles: "DirectPlay", "DirectStream", "Transcode (v:h264 a:eac3)", "Transcode (v:direct a:aac)"
 */
export function parsePlayMethod(raw: string): PlayMethodParsed {
  const s = raw.trim();

  if (s === "DirectPlay") {
    return { mode: "DirectPlay" };
  }

  if (s === "DirectStream") {
    return { mode: "DirectStream" };
  }

  if (s.startsWith("Transcode")) {
    const openParen = s.indexOf("(");
    const closeParen = s.lastIndexOf(")");

    if (openParen >= 0 && closeParen > openParen) {
      const inner = s.slice(openParen + 1, closeParen);
      const parts = inner.split(" ");

      let video: string | undefined;
      let audio: string | undefined;

      for (const part of parts) {
        if (part.startsWith("v:")) {
          video = part.slice(2);
        } else if (part.startsWith("a:")) {
          audio = part.slice(2);
        }
      }

      return { mode: "Transcode", video, audio };
    }

    return { mode: "Transcode" };
  }

  return { mode: "Other" };
}

/**
 * Normalize position value with heuristic for ms vs seconds detection.
 * INT32_MIN (-2147483648) is treated as invalid sentinel.
 * Values >= 86400 (24h) are assumed to be milliseconds if resulting seconds < 6h.
 */
export function normalizePosition(rawNum: number): {
  positionSeconds?: number;
  positionKind: PositionKind;
} {
  if (!Number.isFinite(rawNum) || rawNum === INT32_MIN) {
    return { positionKind: "invalid" };
  }

  // Values >= 24h in seconds likely mean milliseconds
  if (rawNum >= 86400) {
    const asSeconds = rawNum / 1000;
    // Only accept if result is plausible (< 6 hours)
    if (asSeconds > 0 && asSeconds < 21600) {
      return { positionSeconds: asSeconds, positionKind: "milliseconds" };
    }
    return { positionKind: "invalid" };
  }

  return { positionSeconds: rawNum, positionKind: "seconds" };
}

/**
 * Parse episode info from item name.
 * Handles patterns like: "Series Name - s01e05 - Episode Title"
 */
export function parseEpisodeInfo(itemName: string): EpisodeInfo {
  const result: EpisodeInfo = {
    seriesName: null,
    seasonNumber: null,
    episodeNumber: null,
  };

  // Match pattern: "Series Name - sXXeYY" or "Series Name - sXXeYY - Episode Title"
  const match = itemName.match(/^(.+?)\s*-\s*s(\d+)e(\d+)/i);

  if (match) {
    result.seriesName = match[1].trim();
    result.seasonNumber = Number.parseInt(match[2], 10);
    result.episodeNumber = Number.parseInt(match[3], 10);
  }

  return result;
}

/**
 * Parse a single TSV line using end-to-front strategy.
 * This is robust against itemName containing tabs.
 *
 * Expected format (9 columns):
 * timestamp | userId | itemId | itemType | itemName | playMethod | client | deviceName | position
 */
export function parseTsvLine(line: string): PlaybackRow | null {
  const trimmed = line.trimEnd();
  if (!trimmed) return null;

  const parts = trimmed.split("\t");
  if (parts.length < 9) return null;

  // Parse from the end (robust if itemName contains tabs)
  const positionStr = parts[parts.length - 1]!.trim();
  const deviceName = parts[parts.length - 2]!.trim();
  const client = parts[parts.length - 3]!.trim();
  const playMethodRaw = parts[parts.length - 4]!.trim();

  // Fixed fields from the start
  const timestampRaw = parts[0]!.trim();
  const userId = parts[1]!.trim();
  const itemId = parts[2]!.trim();
  const itemType = parts[3]!.trim() as ItemType;

  // Middle becomes itemName (handles tabs in title)
  const nameParts: string[] = [];
  for (let i = 4; i <= parts.length - 5; i++) {
    nameParts.push(parts[i]!);
  }
  const itemNameRaw = nameParts.join("\t");
  const itemName = itemNameRaw.trim();

  // Parse position
  const positionSecondsRaw = Number(positionStr);
  const { positionSeconds, positionKind } = normalizePosition(
    Number.isFinite(positionSecondsRaw) ? positionSecondsRaw : INT32_MIN,
  );

  return {
    timestampRaw,
    timestampMs: parseDotNetTimestamp(timestampRaw),
    userId,
    itemId,
    itemType,
    itemName,
    itemNameRaw,
    playMethodRaw,
    play: parsePlayMethod(playMethodRaw),
    client,
    deviceName,
    positionSeconds,
    positionSecondsRaw: Number.isFinite(positionSecondsRaw)
      ? positionSecondsRaw
      : 0,
    positionKind,
  };
}

/**
 * Validate hex32 format for userId/itemId
 */
export function isValidHex32(value: string): boolean {
  return HEX32.test(value);
}

// =============================================================================
// TSV Parsing
// =============================================================================

function parsePlaybackReportingTsv(text: string): PlaybackReportingData[] {
  const lines = text.split("\n");
  const data: PlaybackReportingData[] = [];

  for (const line of lines) {
    const row = parseTsvLine(line);
    if (!row) continue;

    // Skip rows with invalid position (INT32_MIN sentinel)
    if (row.positionKind === "invalid") continue;

    data.push({
      timestamp: row.timestampRaw,
      userId: row.userId,
      itemId: row.itemId,
      itemType: row.itemType,
      itemName: row.itemName,
      playMethod: row.playMethodRaw,
      clientName: row.client,
      deviceName: row.deviceName,
      durationSeconds: row.positionSeconds,
    });
  }

  return data;
}

// =============================================================================
// JSON Parsing
// =============================================================================

function getValue(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function buildPlaybackData(
  timestamp: string,
  record: Record<string, unknown>,
  durationSeconds?: number,
): PlaybackReportingData {
  const data: PlaybackReportingData = { timestamp };

  const userId = getValue(record, "userId", "user_id", "UserId");
  if (userId) data.userId = userId;

  const itemId = getValue(record, "itemId", "item_id", "ItemId");
  if (itemId) data.itemId = itemId;

  const itemType = getValue(record, "itemType", "item_type", "Type");
  if (itemType) data.itemType = itemType;

  const itemName = getValue(record, "itemName", "item_name", "Name");
  if (itemName) data.itemName = itemName;

  const playMethod = getValue(
    record,
    "playMethod",
    "play_method",
    "PlayMethod",
  );
  if (playMethod) data.playMethod = playMethod;

  const clientName = getValue(record, "clientName", "client_name", "Client");
  if (clientName) data.clientName = clientName;

  const deviceName = getValue(record, "deviceName", "device_name", "Device");
  if (deviceName) data.deviceName = deviceName;

  if (durationSeconds !== undefined && !Number.isNaN(durationSeconds)) {
    data.durationSeconds = durationSeconds;
  }

  return data;
}

function parsePlaybackReportingJson(
  jsonData: unknown,
): PlaybackReportingData[] {
  if (Array.isArray(jsonData)) {
    return jsonData
      .map((item: unknown) => {
        if (typeof item !== "object" || item === null) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const timestamp =
          getValue(record, "timestamp", "date", "time") ||
          new Date().toISOString();

        const durationValue =
          getValue(
            record,
            "durationSeconds",
            "duration_seconds",
            "Duration",
          ) || "0";
        const parsedDuration = Number.parseInt(durationValue, 10);

        if (Number.isNaN(parsedDuration) || parsedDuration < 0) {
          return null;
        }

        return buildPlaybackData(timestamp, record, parsedDuration);
      })
      .filter((item): item is PlaybackReportingData => item !== null);
  }

  if (
    typeof jsonData === "object" &&
    jsonData !== null &&
    !Array.isArray(jsonData)
  ) {
    const obj = jsonData as Record<string, unknown>;
    if (obj.sessions || obj.data) {
      return parsePlaybackReportingJson(obj.sessions || obj.data);
    }
  }

  throw new Error("Unrecognized JSON format");
}

// =============================================================================
// Validation
// =============================================================================

function validatePlaybackReportingData(data: PlaybackReportingData[]): {
  isValid: boolean;
  error?: string;
} {
  if (!Array.isArray(data)) {
    return { isValid: false, error: "Data must be an array" };
  }

  if (data.length === 0) {
    return { isValid: false, error: "Data array is empty" };
  }

  const sampleSize = Math.min(5, data.length);

  for (let i = 0; i < sampleSize; i++) {
    const session = data[i];

    if (typeof session !== "object" || session === null) {
      return { isValid: false, error: `Invalid session object at index ${i}` };
    }

    if (!session.timestamp) {
      return {
        isValid: false,
        error: `Missing required field "timestamp" in session at index ${i}`,
      };
    }

    // Use our custom timestamp parser for validation
    const parsed = parseDotNetTimestamp(session.timestamp);
    if (parsed === undefined && Number.isNaN(Date.parse(session.timestamp))) {
      return {
        isValid: false,
        error: `Invalid timestamp format at index ${i}: ${session.timestamp}`,
      };
    }
  }

  return { isValid: true };
}

// =============================================================================
// Main Import Function
// =============================================================================

export async function importFromPlaybackReporting(
  prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
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
    let data: PlaybackReportingData[];

    const isJson =
      file.name.endsWith(".json") || file.type === "application/json";

    try {
      data = isJson
        ? parsePlaybackReportingJson(JSON.parse(text))
        : parsePlaybackReportingTsv(text);
    } catch (error) {
      return {
        type: "error",
        message: `Failed to parse file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }

    const validationResult = validatePlaybackReportingData(data);
    if (!validationResult.isValid) {
      return {
        type: "error",
        message: validationResult.error || "Invalid data format",
      };
    }

    let importedCount = 0;
    const totalCount = data.length;
    let errorCount = 0;

    for (const playbackData of data) {
      try {
        const imported = await importPlaybackReportingSession(
          playbackData,
          serverIdNum,
        );
        if (imported) {
          importedCount++;
        }
      } catch {
        errorCount++;
      }
    }

    return {
      type: "success",
      message: `Successfully imported ${importedCount} of ${totalCount} sessions from Playback Reporting`,
      importedCount,
      totalCount,
      errorCount,
    };
  } catch (error) {
    return {
      type: "error",
      message: error instanceof Error ? error.message : "Import failed",
    };
  }
}

// =============================================================================
// Session Import
// =============================================================================

async function importPlaybackReportingSession(
  playbackData: PlaybackReportingData,
  serverId: number,
): Promise<boolean> {
  if (!playbackData.timestamp) {
    return false;
  }

  // Parse timestamp using our custom parser first, fallback to Date
  let sessionTime: Date;
  const parsedMs = parseDotNetTimestamp(playbackData.timestamp);
  if (parsedMs !== undefined) {
    sessionTime = new Date(parsedMs);
  } else {
    sessionTime = new Date(playbackData.timestamp);
    if (Number.isNaN(sessionTime.getTime())) {
      return false;
    }
  }

  // Skip sessions with no duration or invalid duration
  if (
    playbackData.durationSeconds === undefined ||
    playbackData.durationSeconds <= 0
  ) {
    return false;
  }

  let finalItemId = playbackData.itemId || null;
  let finalUserId = playbackData.userId || null;
  let userName = "Unknown User";
  const missingReferences: string[] = [];

  // Check if itemId exists
  if (playbackData.itemId) {
    try {
      const existingItem = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.id, playbackData.itemId))
        .limit(1);

      if (existingItem.length === 0) {
        missingReferences.push(`itemId '${playbackData.itemId}' not found`);
        finalItemId = null;
      }
    } catch {
      finalItemId = null;
    }
  }

  // Check if userId exists
  if (playbackData.userId) {
    try {
      const existingUser = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, playbackData.userId))
        .limit(1);

      if (existingUser.length === 0) {
        missingReferences.push(`userId '${playbackData.userId}' not found`);
        finalUserId = null;
      } else {
        userName = existingUser[0].name;
      }
    } catch {
      finalUserId = null;
    }
  }

  const endTime = new Date(
    sessionTime.getTime() + playbackData.durationSeconds * 1000,
  );

  // Parse play method using new function
  const playParsed = parsePlayMethod(playbackData.playMethod || "");
  const isTranscoded = playParsed.mode === "Transcode";
  const isVideoDirect = playParsed.video === "direct";
  const isAudioDirect = playParsed.audio === "direct";

  // Extract series info for episodes
  let seriesName: string | null = null;
  if (
    playbackData.itemType?.toLowerCase() === "episode" &&
    playbackData.itemName
  ) {
    const episodeInfo = parseEpisodeInfo(playbackData.itemName);
    seriesName = episodeInfo.seriesName;
  }

  const sessionId = randomUUID();
  const runtimeTicks = playbackData.durationSeconds * 10000000;
  const positionTicks = runtimeTicks;

  const sessionData: NewSession = {
    id: sessionId,
    serverId: serverId,
    userId: finalUserId,
    itemId: finalItemId,
    userName: userName,
    userServerId: finalUserId,
    itemName: playbackData.itemName || "Unknown Item",
    seriesName: seriesName,
    clientName: playbackData.clientName || "Unknown Client",
    deviceName: playbackData.deviceName || "Unknown Device",
    playMethod: playbackData.playMethod || "Unknown",
    playDuration: playbackData.durationSeconds,
    startTime: sessionTime,
    endTime: endTime,
    lastActivityDate: endTime,
    runtimeTicks: runtimeTicks,
    positionTicks: positionTicks,
    percentComplete: 100,
    completed: true,
    isPaused: false,
    isMuted: false,
    isActive: false,
    isTranscoded: isTranscoded,
    transcodingIsVideoDirect: isVideoDirect,
    transcodingVideoCodec: isVideoDirect ? null : (playParsed.video ?? null),
    transcodingIsAudioDirect: isAudioDirect,
    transcodingAudioCodec: isAudioDirect ? null : (playParsed.audio ?? null),
    rawData: {
      source: "playback_reporting",
      originalData: playbackData,
      importedAt: new Date().toISOString(),
      missingReferences:
        missingReferences.length > 0 ? missingReferences : undefined,
    },
    createdAt: sessionTime,
    updatedAt: new Date(),
    deviceId: null,
    applicationVersion: null,
    remoteEndPoint: null,
    seriesId: null,
    seasonId: null,
    lastPlaybackCheckIn: null,
    volumeLevel: null,
    audioStreamIndex: null,
    subtitleStreamIndex: null,
    mediaSourceId: null,
    repeatMode: null,
    playbackOrder: null,
    videoCodec: null,
    audioCodec: null,
    resolutionWidth: null,
    resolutionHeight: null,
    videoBitRate: null,
    audioBitRate: null,
    audioChannels: null,
    audioSampleRate: null,
    videoRangeType: null,
    transcodingWidth: null,
    transcodingHeight: null,
    transcodingContainer: null,
    transcodeReasons: null,
  };

  await db.insert(sessions).values(sessionData).onConflictDoNothing();

  return true;
}

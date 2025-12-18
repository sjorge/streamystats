import type {
  Item as DatabaseItem,
  Library as DatabaseLibrary,
  Server as DatabaseServer,
} from "@streamystats/database";

declare global {
  // Re-export database types for global use
  type Server = DatabaseServer;
  type Library = DatabaseLibrary;
  type Item = DatabaseItem;

  // Type definitions for library statistics
  interface AggregatedLibraryStatistics {
    movies_count: number;
    episodes_count: number;
    series_count: number;
    libraries_count: number;
    users_count: number;
    total_items: number;
    total_watch_time: number;
    total_play_count: number;
  }

  // Type definitions for item watch statistics
  interface ItemWatchStats {
    item_id: string;
    item: Item;
    total_watch_time: number;
    watch_count: number;
    unique_viewers: number;
    last_watched?: string | null;
    first_watched?: string | null;
  }

  interface ItemWatchStatsResponse {
    data: ItemWatchStats[];
    page: number;
    per_page: number;
    total_pages: number;
    total_items: number;
  }
}

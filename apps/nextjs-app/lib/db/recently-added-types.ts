import type { ImageBlurHashes } from "@streamystats/database/schema";

export interface RecentlyAddedItem {
  id: string;
  name: string;
  type: string;
  productionYear: number | null;
  runtimeTicks: number | null;
  genres: string[] | null;
  primaryImageTag: string | null;
  primaryImageThumbTag: string | null;
  primaryImageLogoTag: string | null;
  backdropImageTags: string[] | null;
  seriesId: string | null;
  seriesPrimaryImageTag: string | null;
  parentBackdropItemId: string | null;
  parentBackdropImageTags: string[] | null;
  parentThumbItemId: string | null;
  parentThumbImageTag: string | null;
  imageBlurHashes: ImageBlurHashes | null;
  dateCreated: Date | null;
}

export interface RecentlyAddedEpisode extends RecentlyAddedItem {
  seasonNumber: number | null;
  episodeNumber: number | null;
  seriesName: string | null;
}

export interface RecentlyAddedSeriesGroup {
  // The series item (for poster, name, etc.)
  series: RecentlyAddedItem;
  // Recent episodes added
  recentEpisodes: RecentlyAddedEpisode[];
  // Total count of episodes added recently
  newEpisodeCount: number;
  // Whether this is a brand new series (all episodes are new)
  isNewSeries: boolean;
  // Most recent episode added (for single episode display)
  latestEpisode: RecentlyAddedEpisode | null;
}

import type { Media } from "./media";

export type MediaSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type AiringStatus =
  | "RELEASING"
  | "FINISHED"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export type ExploreSort =
  | "TRENDING_DESC"
  | "POPULARITY_DESC"
  | "SCORE_DESC"
  | "START_DATE_DESC";

/** Everything the Explore filter bar can express — lives in URL params (§6.3). */
export interface ExploreFilters {
  search?: string;
  genres: string[];
  year?: number;
  season?: MediaSeason;
  formats: string[];
  status?: AiringStatus;
  sort: ExploreSort;
}

export interface BrowsePage {
  pageInfo: { currentPage: number; hasNextPage: boolean };
  media: Media[];
}

/** Detail-page extras on top of the cached Media basics. */
export interface MediaRelation {
  relationType: string;
  media: Media;
}

export interface MediaDetail extends Media {
  descriptionHtml: string | null;
  studios: string[];
  relations: MediaRelation[];
  recommendations: Media[];
}

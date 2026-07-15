export type MediaType = "ANIME" | "MANGA";

export interface MediaTitles {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

/** Cached AniList media — mirrors the media_cache table. */
export interface Media {
  anilistMediaId: number;
  mediaType: MediaType;
  malId: number | null;
  titles: MediaTitles;
  coverUrl: string | null;
  bannerUrl: string | null;
  format: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  /** Per-episode runtime, minutes. Null until the cache row is (re)fetched
   * post-Phase-5b, or for formats AniList doesn't report it for. */
  duration: number | null;
  airingStatus: string | null;
  genres: string[];
  averageScore: number | null;
  season: string | null;
  seasonYear: number | null;
  nextAiringEpisode: number | null;
  nextAiringAt: string | null;
  cachedAt: string;
}

/** One slot in the weekly airing calendar (§6.2). */
export interface AiringItem {
  anilistMediaId: number;
  episode: number;
  airingAt: string;
  media: Media | null;
  inLibrary: boolean;
}

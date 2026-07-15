// Stats dashboard (§6.5): pure aggregation over the already-fetched library
// list (entries + joined media_cache) — no new queries beyond the duration
// column added alongside this. Everything here is a plain function so it's
// testable and reusable from the future native app.
import { ALL_STATUSES } from "@/lib/statusLabels";
import type { LibraryListItem } from "@/services/libraryService";
import type { EntryStatus, MediaType } from "@/types";

/**
 * Fallback when a cached anime's AniList `duration` is unknown — either the
 * cache row predates this field being requested (won't refresh until its
 * next TTL cycle or a revisit) or AniList itself doesn't report one for that
 * entry (movies/specials vary). "Days watched" blends real durations where
 * cached with this estimate elsewhere, and says which it used — never fakes
 * precision, same spirit as the manga "Updated" approximation in §9.
 */
export const AVG_EPISODE_MINUTES = 24;

export interface GenreCount {
  genre: string;
  count: number;
}

export interface StatsSummary {
  totalEntries: number;
  episodesWatched: number;
  chaptersRead: number;
  estimatedDaysWatched: number;
  /** Episodes counted using a real AniList `duration`, out of episodesWatched. */
  episodesWithKnownDuration: number;
  /** 0–100 internal (§4); format for display with the user's score format. */
  meanScore: number | null;
  ratedCount: number;
  statusCounts: Record<MediaType, Record<EntryStatus, number>>;
  topGenres: GenreCount[];
}

function emptyStatusCounts(): Record<EntryStatus, number> {
  const map = {} as Record<EntryStatus, number>;
  for (const s of ALL_STATUSES) map[s] = 0;
  return map;
}

export function computeStats(items: LibraryListItem[]): StatsSummary {
  let episodesWatched = 0;
  let chaptersRead = 0;
  let scoreSum = 0;
  let ratedCount = 0;
  let totalMinutes = 0;
  let episodesWithKnownDuration = 0;
  const statusCounts: Record<MediaType, Record<EntryStatus, number>> = {
    ANIME: emptyStatusCounts(),
    MANGA: emptyStatusCounts(),
  };
  const genreCounts = new Map<string, number>();

  for (const { entry, media } of items) {
    statusCounts[entry.mediaType][entry.status]++;

    if (entry.mediaType === "ANIME") {
      episodesWatched += entry.progress;
      if (media?.duration != null) {
        totalMinutes += entry.progress * media.duration;
        episodesWithKnownDuration += entry.progress;
      } else {
        totalMinutes += entry.progress * AVG_EPISODE_MINUTES;
      }
    } else {
      chaptersRead += entry.progress;
    }

    // A stored 0 is AniList's own "unrated" sentinel, same convention
    // formatScore already uses — never a real score.
    if (entry.score !== null && entry.score !== 0) {
      scoreSum += entry.score;
      ratedCount++;
    }

    if (media) {
      for (const genre of media.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
      }
    }
  }

  const topGenres = [...genreCounts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, 8);

  return {
    totalEntries: items.length,
    episodesWatched,
    chaptersRead,
    estimatedDaysWatched: totalMinutes / 60 / 24,
    episodesWithKnownDuration,
    meanScore: ratedCount > 0 ? scoreSum / ratedCount : null,
    ratedCount,
    statusCounts,
    topGenres,
  };
}

// Stats dashboard (§6.5): pure aggregation over the already-fetched library
// list (entries + joined media_cache) — no new queries, no migrations, no
// deploy. Everything here is a plain function so it's testable and reusable
// from the future native app.
import { ALL_STATUSES } from "@/lib/statusLabels";
import type { LibraryListItem } from "@/services/libraryService";
import type { EntryStatus, MediaType } from "@/types";

/**
 * AniList's per-episode `duration` isn't requested by the anilist function
 * yet (see MEDIA_FIELDS), so it's never in media_cache. "Days watched" is
 * therefore an estimate at this fixed average, not a real figure — same
 * spirit as the manga "Updated" approximation in §9: never fake precision.
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
  const statusCounts: Record<MediaType, Record<EntryStatus, number>> = {
    ANIME: emptyStatusCounts(),
    MANGA: emptyStatusCounts(),
  };
  const genreCounts = new Map<string, number>();

  for (const { entry, media } of items) {
    statusCounts[entry.mediaType][entry.status]++;

    if (entry.mediaType === "ANIME") {
      episodesWatched += entry.progress;
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
    estimatedDaysWatched: (episodesWatched * AVG_EPISODE_MINUTES) / 60 / 24,
    meanScore: ratedCount > 0 ? scoreSum / ratedCount : null,
    ratedCount,
    statusCounts,
    topGenres,
  };
}

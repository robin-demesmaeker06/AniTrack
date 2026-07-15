// "New drops for you" (§6.1): library series (CURRENT or PLANNING, currently
// releasing) with something aired/released beyond the user's progress.
// Anime is precise via next_airing_episode; manga is the §9 approximation —
// chapter-count diffs, labeled "Updated", never fake precision.
// Freshness of the underlying media_cache comes from the Phase 5 refresh job;
// until then it's as fresh as the last browse/detail fetch.
import type { LibraryListItem } from "@/services/libraryService";

export interface Drop {
  item: LibraryListItem;
  /** Episodes aired beyond progress (anime); null for manga (approximate). */
  newEpisodes: number | null;
  /** Latest aired episode / chapter count known. */
  latest: number;
  isApproximate: boolean;
}

export function computeDrops(items: LibraryListItem[]): Drop[] {
  const drops: Drop[] = [];
  for (const item of items) {
    const { entry, media } = item;
    if (!media) continue;
    if (entry.status !== "CURRENT" && entry.status !== "PLANNING") continue;
    if (media.airingStatus !== "RELEASING") continue;

    if (media.mediaType === "ANIME") {
      const aired =
        media.nextAiringEpisode != null
          ? media.nextAiringEpisode - 1
          : media.episodes;
      if (aired != null && aired > entry.progress) {
        drops.push({
          item,
          newEpisodes: aired - entry.progress,
          latest: aired,
          isApproximate: false,
        });
      }
    } else {
      const chapters = media.chapters;
      if (chapters != null && chapters > entry.progress) {
        drops.push({
          item,
          newEpisodes: null,
          latest: chapters,
          isApproximate: true,
        });
      }
    }
  }
  // Most recently updated cache first — roughly "newest drop first".
  return drops.sort((a, b) =>
    (b.item.media?.cachedAt ?? "").localeCompare(a.item.media?.cachedAt ?? ""),
  );
}

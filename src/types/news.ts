import type { MediaType } from "./media";

/** Mirrors news_items (§6.7) — RSS-aggregated (source "ann"/"crunchyroll")
 * or Jikan per-series ("jikan"). Copyright rule: headline/excerpt/thumbnail
 * /link only, never full article text. */
export interface NewsItem {
  id: string;
  source: string;
  guid: string;
  title: string;
  url: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  relatedMalId: number | null;
  /** Best-effort for RSS items (title-matched, may be null); precise for
   * Jikan items (set from the media page that requested them). */
  relatedAnilistMediaId: number | null;
  mediaType: MediaType | null;
  fetchedAt: string;
}

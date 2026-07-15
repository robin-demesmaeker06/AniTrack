// News (§6.7): RSS-aggregated headlines (news-fetch, scheduled) plus
// per-series Jikan news (series-news, lazy-fetched). Both write into the
// same news_items table — this file only reads it (+ invokes series-news).
import { getSupabase } from "./supabaseClient";
import type { MediaType, NewsItem } from "@/types";

interface NewsRow {
  id: string;
  source: string;
  guid: string;
  title: string;
  url: string;
  excerpt: string | null;
  image_url: string | null;
  published_at: string | null;
  related_mal_id: number | null;
  related_anilist_media_id: number | null;
  media_type: MediaType | null;
  fetched_at: string;
}

function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: row.id,
    source: row.source,
    guid: row.guid,
    title: row.title,
    url: row.url,
    excerpt: row.excerpt,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    relatedMalId: row.related_mal_id,
    relatedAnilistMediaId: row.related_anilist_media_id,
    mediaType: row.media_type,
    fetchedAt: row.fetched_at,
  };
}

/** Reverse-chron RSS-aggregated news for the News page. Excludes Jikan
 * per-series items — those live on the media detail page instead, scoped to
 * one series rather than mixed into the general feed. */
export async function getNews(limit = 40): Promise<NewsItem[]> {
  const { data, error } = await getSupabase()
    .from("news_items")
    .select("*")
    .neq("source", "jikan")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data as NewsRow[]).map(toNewsItem);
}

/** "News on your series" (Home): RSS items best-effort matched to anything
 * in this library. Can come back empty — the matching in news-fetch is
 * intentionally conservative; it never guesses wrong, it just sometimes
 * misses (§9's don't-fake-precision spirit, applied to matching). */
export async function getNewsForMedia(
  anilistMediaIds: number[],
  limit = 5,
): Promise<NewsItem[]> {
  if (anilistMediaIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("news_items")
    .select("*")
    .in("related_anilist_media_id", anilistMediaIds)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data as NewsRow[]).map(toNewsItem);
}

/** Jikan per-series news, lazy-fetched when a media page opens. The
 * series-news function owns the 12–24h read-through cache; this just calls
 * it — no client-side caching beyond react-query's own staleTime. */
export async function getSeriesNews(
  malId: number,
  mediaType: MediaType,
  anilistMediaId: number,
): Promise<NewsItem[]> {
  const { data, error } = await getSupabase().functions.invoke("series-news", {
    body: { malId, mediaType, anilistMediaId },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error("Couldn't load news for this series.");
  }
  const rows = (data?.items ?? []) as NewsRow[];
  return rows.map(toNewsItem);
}

// All AniList access goes through the `anilist` Edge Function — the client
// never calls graphql.anilist.co directly (§3: one rate-limit budget, one
// cache pipeline). For details there's a fast path reading media_cache
// straight from Postgres (public-read) before falling back to the function.
import { getSupabase } from "./supabaseClient";
import type {
  BrowsePage,
  ExploreFilters,
  Media,
  MediaDetail,
  MediaType,
} from "@/types";

// ---------------------------------------------------------------- mapping

interface RawMedia {
  id: number;
  idMal: number | null;
  type: MediaType;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  averageScore: number | null;
  genres: string[] | null;
  bannerImage: string | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null } | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  description?: string | null;
  studios?: { nodes: Array<{ name: string }> };
  relations?: {
    edges: Array<{ relationType: string; node: RawMedia }>;
  };
  recommendations?: {
    nodes: Array<{ mediaRecommendation: RawMedia | null }>;
  };
}

function toMedia(raw: RawMedia): Media {
  return {
    anilistMediaId: raw.id,
    mediaType: raw.type,
    malId: raw.idMal ?? null,
    titles: {
      romaji: raw.title?.romaji ?? null,
      english: raw.title?.english ?? null,
      native: raw.title?.native ?? null,
    },
    coverUrl: raw.coverImage?.extraLarge ?? raw.coverImage?.large ?? null,
    bannerUrl: raw.bannerImage ?? null,
    format: raw.format ?? null,
    episodes: raw.episodes ?? null,
    chapters: raw.chapters ?? null,
    volumes: raw.volumes ?? null,
    airingStatus: raw.status ?? null,
    genres: raw.genres ?? [],
    averageScore: raw.averageScore ?? null,
    season: raw.season ?? null,
    seasonYear: raw.seasonYear ?? null,
    nextAiringEpisode: raw.nextAiringEpisode?.episode ?? null,
    nextAiringAt: raw.nextAiringEpisode
      ? new Date(raw.nextAiringEpisode.airingAt * 1000).toISOString()
      : null,
    cachedAt: new Date().toISOString(),
  };
}

function toDetail(raw: RawMedia): MediaDetail {
  return {
    ...toMedia(raw),
    descriptionHtml: raw.description ?? null,
    studios: raw.studios?.nodes.map((s) => s.name) ?? [],
    relations:
      raw.relations?.edges
        .filter((e) => e.node && (e.node.type === "ANIME" || e.node.type === "MANGA"))
        .map((e) => ({ relationType: e.relationType, media: toMedia(e.node) })) ?? [],
    recommendations:
      raw.recommendations?.nodes
        .map((n) => n.mediaRecommendation)
        .filter((m): m is RawMedia => Boolean(m))
        .map(toMedia) ?? [],
  };
}

// ---------------------------------------------------------------- calls

async function invokeAniList<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("anilist", {
    body,
  });
  if (error) {
    // FunctionsHttpError carries the response; surface its message.
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.json().catch(() => null);
      if (payload?.error) {
        throw new Error(
          payload.retryAfter
            ? `${payload.error} — try again in ~${payload.retryAfter}s.`
            : payload.error,
        );
      }
    }
    throw new Error("Couldn't reach AniList. Try again in a moment.");
  }
  return data as T;
}

export async function browseMedia(
  type: MediaType,
  filters: ExploreFilters,
  page: number,
): Promise<BrowsePage> {
  const data = await invokeAniList<{
    pageInfo: BrowsePage["pageInfo"];
    media: RawMedia[];
  }>({
    action: "browse",
    type,
    page,
    search: filters.search || undefined,
    genres: filters.genres.length ? filters.genres : undefined,
    year: filters.year,
    season: filters.season,
    formats: filters.formats.length ? filters.formats : undefined,
    status: filters.status,
    sort: filters.sort,
  });
  return { pageInfo: data.pageInfo, media: data.media.map(toMedia) };
}

interface CacheRow {
  raw: RawMedia;
  cached_at: string;
  airing_status: string | null;
}

function cacheIsFresh(row: CacheRow): boolean {
  const ttlMs =
    row.airing_status === "RELEASING" || row.airing_status === "NOT_YET_RELEASED"
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
  return Date.now() - new Date(row.cached_at).getTime() < ttlMs;
}

export async function getMediaDetail(
  type: MediaType,
  id: number,
): Promise<MediaDetail> {
  // Fast path: fresh, detail-quality cache row straight from Postgres.
  const { data: row } = await getSupabase()
    .from("media_cache")
    .select("raw, cached_at, airing_status")
    .eq("anilist_media_id", id)
    .eq("media_type", type)
    .maybeSingle();

  const cached = row as CacheRow | null;
  if (cached?.raw && "relations" in cached.raw && cacheIsFresh(cached)) {
    return toDetail(cached.raw);
  }

  const data = await invokeAniList<{ media: RawMedia }>({
    action: "detail",
    id,
    type,
  });
  return toDetail(data.media);
}

// ---------------------------------------------------------------- schedule

/** One airing slot in the weekly calendar (§6.2). */
export interface AiringSlot {
  episode: number;
  /** ISO string, converted from AniList's unix seconds. */
  airingAt: string;
  media: Media;
}

/**
 * All airing episodes between start and end (unix seconds, ≤ 8 days).
 * The Edge Function paginates AniList and filters adult entries.
 */
export async function getAiringSchedule(
  start: number,
  end: number,
): Promise<AiringSlot[]> {
  const data = await invokeAniList<{
    schedules: Array<{ episode: number; airingAt: number; media: RawMedia }>;
  }>({ action: "schedule", start, end });

  return data.schedules.map((s) => ({
    episode: s.episode,
    airingAt: new Date(s.airingAt * 1000).toISOString(),
    media: toMedia(s.media),
  }));
}

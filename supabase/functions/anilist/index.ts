// anilist — the app's only gateway to the AniList GraphQL API (§3).
//
// Three actions:
//   browse   — search/filter pages for Explore; every media object returned
//              is upserted into media_cache.
//   detail   — one media with relations/recommendations; served from
//              media_cache when fresh (TTL 1h releasing / 24h otherwise),
//              fetched + upserted otherwise.
//   schedule — airingSchedules for a time window (Schedule page, §6.2);
//              paginates AniList internally, upserts media it sees.
//
// Centralizing this here enforces one AniList budget (~30 req/min, §3),
// per-user rate limits (§8), and keeps media_cache service-write-only (§4).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { captureError, flushSentry } from "../_shared/sentry.ts";

const ANILIST_URL = "https://graphql.anilist.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------- schemas

const animeFormats = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL"] as const;
const mangaFormats = ["MANGA", "NOVEL", "ONE_SHOT"] as const;

const BrowseSchema = z.object({
  action: z.literal("browse"),
  type: z.enum(["ANIME", "MANGA"]),
  page: z.number().int().min(1).max(500).default(1),
  search: z.string().trim().min(1).max(100).optional(),
  genres: z.array(z.string().max(30)).max(10).optional(),
  year: z.number().int().min(1940).max(2030).optional(),
  season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).optional(),
  formats: z
    .array(z.enum([...animeFormats, ...mangaFormats]))
    .max(8)
    .optional(),
  status: z
    .enum(["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"])
    .optional(),
  sort: z
    .enum(["TRENDING_DESC", "POPULARITY_DESC", "SCORE_DESC", "START_DATE_DESC"])
    .default("TRENDING_DESC"),
});

const DetailSchema = z.object({
  action: z.literal("detail"),
  id: z.number().int().positive(),
  type: z.enum(["ANIME", "MANGA"]),
});

// start/end are unix seconds. No .refine() here — zod 3's discriminatedUnion
// only accepts plain ZodObjects, so the window check lives in the handler.
const ScheduleSchema = z.object({
  action: z.literal("schedule"),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
});

const BodySchema = z.discriminatedUnion("action", [
  BrowseSchema,
  DetailSchema,
  ScheduleSchema,
]);

// ---------------------------------------------------------------- queries

const MEDIA_FIELDS = `
  id idMal type format status season seasonYear
  episodes chapters volumes duration averageScore genres bannerImage
  title { romaji english native }
  coverImage { extraLarge large }
  nextAiringEpisode { episode airingAt }
`;

const BROWSE_QUERY = `
query Browse($page: Int, $type: MediaType, $search: String, $genres: [String],
             $year: Int, $season: MediaSeason, $formats: [MediaFormat],
             $status: MediaStatus, $sort: [MediaSort]) {
  Page(page: $page, perPage: 24) {
    pageInfo { currentPage hasNextPage }
    media(type: $type, search: $search, genre_in: $genres, seasonYear: $year,
          season: $season, format_in: $formats, status: $status, sort: $sort,
          isAdult: false) {
      ${MEDIA_FIELDS}
    }
  }
}`;

const DETAIL_QUERY = `
query Detail($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    ${MEDIA_FIELDS}
    description(asHtml: true)
    studios(isMain: true) { nodes { name } }
    relations {
      edges {
        relationType(version: 2)
        node {
          id type format status
          title { romaji english native }
          coverImage { large }
        }
      }
    }
    recommendations(perPage: 10, sort: RATING_DESC) {
      nodes {
        mediaRecommendation {
          id type format averageScore
          title { romaji english native }
          coverImage { large }
        }
      }
    }
  }
}`;

const AIRING_QUERY = `
query Airing($page: Int, $start: Int, $end: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      episode
      airingAt
      media {
        ${MEDIA_FIELDS}
        isAdult
      }
    }
  }
}`;

// ---------------------------------------------------------------- helpers

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface AniListMedia {
  id: number;
  idMal: number | null;
  type: "ANIME" | "MANGA";
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  /** Per-episode runtime, minutes. Movies/specials sometimes lack it. */
  duration: number | null;
  averageScore: number | null;
  genres: string[] | null;
  bannerImage: string | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null } | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  [key: string]: unknown;
}

function toCacheRow(m: AniListMedia) {
  return {
    anilist_media_id: m.id,
    media_type: m.type,
    mal_id: m.idMal,
    title_romaji: m.title?.romaji ?? null,
    title_english: m.title?.english ?? null,
    title_native: m.title?.native ?? null,
    cover_url: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    banner_url: m.bannerImage,
    format: m.format,
    episodes: m.episodes,
    chapters: m.chapters,
    volumes: m.volumes,
    duration: m.duration ?? null,
    airing_status: m.status,
    genres: m.genres ?? [],
    average_score: m.averageScore,
    season: m.season,
    season_year: m.seasonYear,
    next_airing_episode: m.nextAiringEpisode?.episode ?? null,
    next_airing_at: m.nextAiringEpisode
      ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString()
      : null,
    raw: m,
    cached_at: new Date().toISOString(),
  };
}

async function fetchAniList(
  query: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: Response }> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  // §3: respect Retry-After, surface 429s so the client backs off.
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "60");
    return {
      ok: false,
      response: json(429, { error: "AniList rate limit reached", retryAfter }),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      response: json(502, { error: `AniList responded ${res.status}` }),
    };
  }

  const payload = await res.json();
  if (payload.errors?.length) {
    const notFound = payload.errors.some(
      (e: { status?: number }) => e.status === 404,
    );
    return {
      ok: false,
      response: notFound
        ? json(404, { error: "Not found on AniList" })
        : json(502, { error: "AniList query failed" }),
    };
  }
  return { ok: true, data: payload.data };
}

function isFresh(cachedAt: string, airingStatus: string | null): boolean {
  const ttlMs =
    airingStatus === "RELEASING" || airingStatus === "NOT_YET_RELEASED"
      ? 60 * 60 * 1000 // 1h for currently airing/releasing (§3)
      : 24 * 60 * 60 * 1000; // 24h for finished
  return Date.now() - new Date(cachedAt).getTime() < ttlMs;
}

async function upsertMedia(admin: SupabaseClient, media: AniListMedia[]) {
  if (media.length === 0) return;
  const { error } = await admin
    .from("media_cache")
    .upsert(media.map(toCacheRow), { onConflict: "anilist_media_id,media_type" });
  if (error) throw error;
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let userId: string | undefined;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) {
      return json(401, { error: "Invalid session" });
    }
    userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: "Invalid request" });
    }
    const body = parsed.data;

    // Per-user limits (§8); AniList's own budget is enforced reactively via
    // its 429 + Retry-After.
    // schedule fans out to several AniList pages per call, so it gets the
    // tightest per-user budget.
    const { data: allowed, error: rlError } = await admin.rpc("bump_rate_limit", {
      p_user: userId,
      p_action: `anilist:${body.action}`,
      p_limit:
        body.action === "schedule" ? 6 : body.action === "browse" ? 20 : 30,
    });
    if (rlError) throw rlError;
    if (!allowed) {
      return json(429, { error: "Slow down a little", retryAfter: 30 });
    }

    if (body.action === "browse") {
      const result = await fetchAniList(BROWSE_QUERY, {
        page: body.page,
        type: body.type,
        search: body.search,
        genres: body.genres,
        year: body.year,
        season: body.season,
        formats: body.formats,
        status: body.status,
        sort: [body.sort],
      });
      if (!result.ok) return result.response;

      const page = result.data.Page as {
        pageInfo: { currentPage: number; hasNextPage: boolean };
        media: AniListMedia[];
      };
      await upsertMedia(admin, page.media);
      return json(200, { pageInfo: page.pageInfo, media: page.media });
    }

    if (body.action === "schedule") {
      // Window check (moved out of the zod schema, see ScheduleSchema).
      if (body.end <= body.start || body.end - body.start > 8 * 86400) {
        return json(400, { error: "Invalid window" });
      }
      // Paginate the whole window server-side (a week is ~5–7 pages).
      // No server cache yet — the client holds the week for 15 min, and the
      // per-user limit above keeps refresh-spamming off AniList's budget.
      interface RawSlot {
        episode: number;
        airingAt: number;
        media: (AniListMedia & { isAdult?: boolean | null }) | null;
      }
      const slots: RawSlot[] = [];
      for (let page = 1; page <= 8; page++) {
        const result = await fetchAniList(AIRING_QUERY, {
          page,
          start: body.start,
          end: body.end,
        });
        if (!result.ok) {
          // Partial week beats a hard failure; only fail with nothing to show.
          if (slots.length > 0) break;
          return result.response;
        }
        const p = result.data.Page as {
          pageInfo: { hasNextPage: boolean };
          airingSchedules: RawSlot[];
        };
        slots.push(...p.airingSchedules);
        if (!p.pageInfo.hasNextPage) break;
      }

      const clean = slots.filter(
        (s): s is RawSlot & { media: AniListMedia } =>
          Boolean(s.media) && !s.media?.isAdult,
      );

      // One row per media for the upsert (a series can air twice in a window).
      const byId = new Map<number, AniListMedia>();
      for (const s of clean) byId.set(s.media.id, s.media);
      await upsertMedia(admin, [...byId.values()]);

      return json(200, {
        schedules: clean.map((s) => ({
          episode: s.episode,
          airingAt: s.airingAt,
          media: s.media,
        })),
      });
    }

    // detail — cache first
    const { data: cached } = await admin
      .from("media_cache")
      .select("raw, cached_at, airing_status")
      .eq("anilist_media_id", body.id)
      .eq("media_type", body.type)
      .maybeSingle();

    const cachedRaw = cached?.raw as AniListMedia | undefined;
    if (
      cached &&
      cachedRaw &&
      "relations" in cachedRaw && // detail-quality, not a browse stub
      isFresh(cached.cached_at, cached.airing_status)
    ) {
      return json(200, { media: cachedRaw, fromCache: true });
    }

    const result = await fetchAniList(DETAIL_QUERY, {
      id: body.id,
      type: body.type,
    });
    if (!result.ok) return result.response;

    const media = result.data.Media as AniListMedia;
    await upsertMedia(admin, [media]);
    return json(200, { media, fromCache: false });
  } catch (err) {
    captureError(err, userId);
    await flushSentry();
    return json(500, { error: "Something went wrong" });
  }
});

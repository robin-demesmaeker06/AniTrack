// drop-check — the scheduled drop-detection job (§6.6).
//
// Runs every 30–60 min (pg_cron / dashboard scheduler, see the phase5
// migration). For every releasing series in at least one user's library it:
//   1. refreshes media_cache from AniList (batched id_in queries), which is
//      also what keeps Home's "New drops" fresh — one pipeline;
//   2. compares the latest aired episode / chapter count against each user's
//      progress and inserts NEW_EPISODE / NEW_CHAPTER notifications.
// Idempotent: inserts go through insert_notifications(), which relies on
// notifications_dedupe_idx (payload->>'number') — re-runs never double-notify.
//
// Not user-facing: callers must present the service-role key (the cron
// scheduler adds it as the Authorization header).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { captureError, flushSentry } from "../_shared/sentry.ts";

const ANILIST_URL = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id idMal type format status season seasonYear
  episodes chapters volumes duration averageScore genres bannerImage
  title { romaji english native }
  coverImage { extraLarge large }
  nextAiringEpisode { episode airingAt }
`;

// One request refreshes up to 50 series regardless of type — AniList media
// ids are global across anime/manga.
const BATCH_QUERY = `
query Batch($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids) {
      ${MEDIA_FIELDS}
    }
  }
}`;

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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------- pieces

interface EntryRow {
  user_id: string;
  anilist_media_id: number;
  media_type: "ANIME" | "MANGA";
  progress: number;
}

interface CacheSlice {
  anilist_media_id: number;
  media_type: "ANIME" | "MANGA";
  airing_status: string | null;
  episodes: number | null;
  chapters: number | null;
  next_airing_episode: number | null;
  title_english: string | null;
  title_romaji: string | null;
}

/** AniList refresh in batches of 50; stops early on 429 (next run catches up). */
async function refreshMedia(
  admin: SupabaseClient,
  ids: number[],
): Promise<{ refreshed: number; rateLimited: boolean }> {
  let refreshed = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: BATCH_QUERY,
        variables: { ids: ids.slice(i, i + 50) },
      }),
    });
    if (res.status === 429) return { refreshed, rateLimited: true };
    if (!res.ok) throw new Error(`AniList responded ${res.status}`);
    const payload = await res.json();
    if (payload.errors?.length) throw new Error("AniList batch query failed");

    const media = (payload.data.Page.media as AniListMedia[]) ?? [];
    if (media.length > 0) {
      const { error } = await admin
        .from("media_cache")
        .upsert(media.map(toCacheRow), {
          onConflict: "anilist_media_id,media_type",
        });
      if (error) throw error;
      refreshed += media.length;
    }
  }
  return { refreshed, rateLimited: false };
}

/** The same "what's new for this user" rules as Home's computeDrops (§6.1/§9). */
function buildNotifications(entries: EntryRow[], cache: Map<string, CacheSlice>) {
  const out: Array<{
    user_id: string;
    type: "NEW_EPISODE" | "NEW_CHAPTER";
    anilist_media_id: number;
    payload: Record<string, unknown>;
  }> = [];

  for (const entry of entries) {
    const media = cache.get(`${entry.media_type}:${entry.anilist_media_id}`);
    if (!media || media.airing_status !== "RELEASING") continue;
    const title = media.title_english ?? media.title_romaji ?? "Untitled";

    if (entry.media_type === "ANIME") {
      const aired =
        media.next_airing_episode != null
          ? media.next_airing_episode - 1
          : media.episodes;
      if (aired != null && aired > entry.progress) {
        out.push({
          user_id: entry.user_id,
          type: "NEW_EPISODE",
          anilist_media_id: entry.anilist_media_id,
          // "number" feeds notifications_dedupe_idx.
          payload: { number: aired, title, mediaType: "ANIME" },
        });
      }
    } else if (media.chapters != null && media.chapters > entry.progress) {
      out.push({
        user_id: entry.user_id,
        type: "NEW_CHAPTER",
        anilist_media_id: entry.anilist_media_id,
        // §9: chapter counts are approximate — label "Updated", no precision.
        payload: { number: media.chapters, title, mediaType: "MANGA" },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (auth !== serviceKey) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Series that can drop something: CURRENT or PLANNING, same as Home.
    const { data: entryRows, error: entryError } = await admin
      .from("library_entries")
      .select("user_id, anilist_media_id, media_type, progress")
      .in("status", ["CURRENT", "PLANNING"]);
    if (entryError) throw entryError;
    const entries = (entryRows ?? []) as EntryRow[];

    const mediaIds = [...new Set(entries.map((e) => e.anilist_media_id))];
    if (mediaIds.length === 0) {
      return json(200, { mediaChecked: 0, refreshed: 0, notificationsCreated: 0 });
    }

    const readCache = async (): Promise<Map<string, CacheSlice>> => {
      const map = new Map<string, CacheSlice>();
      for (let i = 0; i < mediaIds.length; i += 200) {
        const { data, error } = await admin
          .from("media_cache")
          .select(
            "anilist_media_id, media_type, airing_status, episodes, chapters, next_airing_episode, title_english, title_romaji",
          )
          .in("anilist_media_id", mediaIds.slice(i, i + 200));
        if (error) throw error;
        for (const row of (data ?? []) as CacheSlice[]) {
          map.set(`${row.media_type}:${row.anilist_media_id}`, row);
        }
      }
      return map;
    };

    // Refresh anything releasing, about to release, or never cached.
    const before = await readCache();
    const staleIds = mediaIds.filter((id) => {
      const rows = [before.get(`ANIME:${id}`), before.get(`MANGA:${id}`)].filter(
        Boolean,
      ) as CacheSlice[];
      if (rows.length === 0) return true; // never cached
      return rows.some(
        (r) =>
          r.airing_status === "RELEASING" ||
          r.airing_status === "NOT_YET_RELEASED",
      );
    });

    const { refreshed, rateLimited } = await refreshMedia(admin, staleIds);
    const cache = refreshed > 0 ? await readCache() : before;

    const notifications = buildNotifications(entries, cache);
    let created = 0;
    if (notifications.length > 0) {
      const { data, error } = await admin.rpc("insert_notifications", {
        p_items: notifications,
      });
      if (error) throw error;
      created = data ?? 0;
    }

    return json(200, {
      mediaChecked: mediaIds.length,
      refreshed,
      notificationsCreated: created,
      ...(rateLimited ? { note: "AniList 429 — finished a partial batch" } : {}),
    });
  } catch (err) {
    captureError(err);
    await flushSentry();
    return json(500, { error: "drop-check failed" });
  }
});

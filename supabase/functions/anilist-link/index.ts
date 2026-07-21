// anilist-link — AniList OAuth link + one-way library import (Phase 6a).
//
// Two actions, both JWT-authed (the caller is a signed-in AniTrack user):
//   exchange — trade the OAuth authorization code for an AniList access token,
//              look up the AniList viewer, encrypt the token (AES-GCM, key from
//              env) and store it in anilist_connections. The token is never
//              returned to the client.
//   import   — using the stored token, pull the user's AniList
//              MediaListCollection (anime + manga) and upsert media_cache +
//              library_entries. Conflict rule (§Phase 6): newest updated_at
//              wins — a local row that's newer than its AniList counterpart is
//              left untouched.
//
// access_token is service-role-only (column grants in the init migration);
// this function is its only writer. Unlink + link-status reads happen
// client-side through RLS — no action here for those.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { captureError, flushSentry } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANILIST_GQL = "https://graphql.anilist.co";
const ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";

const ExchangeSchema = z.object({
  action: z.literal("exchange"),
  code: z.string().min(1).max(2000),
  redirectUri: z.string().url().max(500),
});
const ImportSchema = z.object({ action: z.literal("import") });
const BodySchema = z.discriminatedUnion("action", [ExchangeSchema, ImportSchema]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------- token crypto
// AES-GCM with a 32-byte key from env (base64). Stored value is
// base64(iv[12] || ciphertext+tag) — self-contained, no separate IV column.

async function tokenKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get("ANILIST_TOKEN_KEY");
  if (!b64) throw new Error("ANILIST_TOKEN_KEY not set");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("ANILIST_TOKEN_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptToken(plain: string): Promise<string> {
  const key = await tokenKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

async function decryptToken(payload: string): Promise<string> {
  const key = await tokenKey();
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------------------------------------------------------------- anilist
class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super("AniList rate limit");
  }
}

async function anilistGraphQL(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<Record<string, any>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(ANILIST_GQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    throw new RateLimited(Number(res.headers.get("Retry-After") ?? "60"));
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.errors) {
    throw new Error(payload?.errors?.[0]?.message ?? `AniList error ${res.status}`);
  }
  return payload.data;
}

const MEDIA_FRAGMENT = `
fragment mediaFields on Media {
  id idMal type format status season seasonYear
  episodes chapters volumes duration averageScore genres bannerImage
  title { romaji english native }
  coverImage { extraLarge large }
  nextAiringEpisode { episode airingAt }
}`;

const LIST_QUERY = `
query ($userId: Int, $type: MediaType) {
  MediaListCollection(userId: $userId, type: $type) {
    lists {
      entries {
        id status progress progressVolumes score(format: POINT_100) notes updatedAt
        startedAt { year month day }
        completedAt { year month day }
        media { ...mediaFields }
      }
    }
  }
}
${MEDIA_FRAGMENT}`;

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
  duration: number | null;
  averageScore: number | null;
  genres: string[] | null;
  bannerImage: string | null;
  title: { romaji: string | null; english: string | null; native: string | null } | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
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

interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}
function fuzzyToDate(d: FuzzyDate | null): string | null {
  if (!d?.year || !d?.month || !d?.day) return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

async function chunkedUpsert(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from(table)
      .upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------- handlers

async function handleExchange(
  admin: SupabaseClient,
  userId: string,
  code: string,
  redirectUri: string,
): Promise<Response> {
  const clientId = Deno.env.get("ANILIST_CLIENT_ID");
  const clientSecret = Deno.env.get("ANILIST_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return json(500, { error: "AniList sync isn't configured on the server." });
  }

  const tokenRes = await fetch(ANILIST_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenText = await tokenRes.text();
  let tok: { access_token?: string; expires_in?: number } | null = null;
  try {
    tok = JSON.parse(tokenText);
  } catch {
    // non-JSON body (e.g. an HTML error page) — keep the raw text as detail
  }
  if (!tokenRes.ok || !tok?.access_token) {
    const t = tok as Record<string, unknown> | null;
    const detail =
      (t?.hint as string) ??
      (t?.error_description as string) ??
      (t?.message as string) ??
      (t?.error as string) ??
      tokenText.slice(0, 300);
    console.error("AniList token exchange failed:", tokenRes.status, detail);
    return json(400, {
      error: "AniList rejected the authorization.",
      detail: `${tokenRes.status}: ${detail}`,
    });
  }

  const viewer = await anilistGraphQL(`query { Viewer { id name } }`, {}, tok.access_token);
  const anilistUserId = viewer?.Viewer?.id;
  const name = viewer?.Viewer?.name ?? null;
  if (!anilistUserId) {
    return json(502, { error: "Couldn't read your AniList profile. Try again." });
  }

  const expiresIn = Number(tok.expires_in ?? 0);
  const { error } = await admin.from("anilist_connections").upsert(
    {
      user_id: userId,
      anilist_user_id: anilistUserId,
      access_token: await encryptToken(tok.access_token),
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      sync_enabled: true,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  return json(200, { anilistUserId, name });
}

async function handleImport(admin: SupabaseClient, userId: string): Promise<Response> {
  const { data: conn, error: connError } = await admin
    .from("anilist_connections")
    .select("anilist_user_id, access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (connError) throw connError;
  if (!conn?.access_token) {
    return json(400, { error: "No AniList account is linked." });
  }
  const token = await decryptToken(conn.access_token);

  // Existing local entries → newest-wins comparison (§Phase 6). Map keyed by
  // "TYPE:mediaId" to each row's local updated_at (ms).
  const { data: existing, error: exError } = await admin
    .from("library_entries")
    .select("anilist_media_id, media_type, updated_at")
    .eq("user_id", userId);
  if (exError) throw exError;
  const localUpdated = new Map<string, number>(
    (existing ?? []).map((e) => [
      `${e.media_type}:${e.anilist_media_id}`,
      new Date(e.updated_at as string).getTime(),
    ]),
  );

  const cacheByKey = new Map<string, Record<string, unknown>>();
  const entryRows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const type of ["ANIME", "MANGA"] as const) {
    const data = await anilistGraphQL(LIST_QUERY, { userId: conn.anilist_user_id, type }, token);
    const lists = data?.MediaListCollection?.lists ?? [];
    for (const list of lists) {
      for (const e of list.entries ?? []) {
        const m: AniListMedia | undefined = e.media;
        if (!m) continue;
        const key = `${m.type}:${m.id}`;
        cacheByKey.set(key, toCacheRow(m)); // one cache row per media, even if skipped

        const anilistMs = (e.updatedAt ?? 0) * 1000;
        const local = localUpdated.get(key);
        if (local !== undefined && local >= anilistMs) {
          skipped++; // local row is newer or same-age — keep it
          continue;
        }
        entryRows.push({
          user_id: userId,
          anilist_media_id: m.id,
          media_type: m.type,
          status: e.status,
          progress: e.progress ?? 0,
          progress_volumes: e.progressVolumes ?? null,
          score: e.score ? Math.round(e.score) : null, // POINT_100, 0 = unscored
          notes: e.notes ?? null,
          started_at: fuzzyToDate(e.startedAt),
          finished_at: fuzzyToDate(e.completedAt),
          anilist_entry_id: e.id,
          synced_at: now,
          updated_at: now,
        });
        if (local === undefined) imported++;
        else updated++;
      }
    }
  }

  await chunkedUpsert(admin, "media_cache", [...cacheByKey.values()], "anilist_media_id,media_type");
  await chunkedUpsert(admin, "library_entries", entryRows, "user_id,anilist_media_id,media_type");

  await admin
    .from("anilist_connections")
    .update({ last_synced_at: now })
    .eq("user_id", userId);

  return json(200, { imported, updated, skipped, total: imported + updated + skipped });
}

// ---------------------------------------------------------------- entrypoint

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

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
    const userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: "Invalid request" });
    }
    const body = parsed.data;

    // Both actions hit AniList; import is heavier (two collection pulls) so it
    // gets the tighter per-user budget.
    const { data: allowed, error: rlError } = await admin.rpc("bump_rate_limit", {
      p_user: userId,
      p_action: `anilist-link:${body.action}`,
      p_limit: body.action === "import" ? 4 : 8,
    });
    if (rlError) throw rlError;
    if (!allowed) {
      return json(429, { error: "Slow down a little", retryAfter: 30 });
    }

    if (body.action === "exchange") {
      return await handleExchange(admin, userId, body.code, body.redirectUri);
    }
    return await handleImport(admin, userId);
  } catch (err) {
    if (err instanceof RateLimited) {
      return json(429, { error: "AniList is rate-limiting us — try again shortly.", retryAfter: err.retryAfter });
    }
    captureError(err);
    await flushSentry();
    return json(500, { error: "AniList link failed" });
  }
});

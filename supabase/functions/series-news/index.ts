// series-news — per-series news via Jikan (§6.7), invoked on-demand from the
// media detail page. Unlike news-fetch (RSS, scheduled, service-role only),
// this one is user-facing: authenticated users call it through
// supabase.functions.invoke, same shape as the anilist function (JWT check +
// bump_rate_limit), and it uses a service-role client internally only to
// bypass RLS on the news_items write (public read already covers the client).
//
// Read-through cache in news_items itself (source = 'jikan', guid = the
// Jikan news entry's mal_id, keyed by related_mal_id + media_type): if a
// cached batch for this series is fresher than JIKAN_CACHE_TTL_MS, return it
// as-is — no Jikan call. Otherwise fetch, upsert, return the fresh batch.
// This is also what keeps Jikan traffic near its own ~1 req/s budget: a
// cache hit costs nothing, and a miss is one series' worth of one request.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { captureError, flushSentry } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Spec calls for 12–24h; splitting the difference.
const JIKAN_CACHE_TTL_MS = 16 * 60 * 60 * 1000;

const BodySchema = z.object({
  malId: z.number().int().positive(),
  mediaType: z.enum(["ANIME", "MANGA"]),
  anilistMediaId: z.number().int().positive(),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function truncate(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

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
  media_type: "ANIME" | "MANGA" | null;
  fetched_at: string;
}

interface JikanNewsItem {
  mal_id: number;
  url: string;
  title: string;
  date: string | null;
  images?: { jpg?: { image_url?: string | null } };
  excerpt?: string | null;
}

async function readCache(
  admin: SupabaseClient,
  malId: number,
  mediaType: "ANIME" | "MANGA",
): Promise<NewsRow[]> {
  const { data, error } = await admin
    .from("news_items")
    .select("*")
    .eq("source", "jikan")
    .eq("related_mal_id", malId)
    .eq("media_type", mediaType)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as NewsRow[];
}

function isFresh(rows: NewsRow[]): boolean {
  if (rows.length === 0) return false;
  const newest = Math.max(...rows.map((r) => new Date(r.fetched_at).getTime()));
  return Date.now() - newest < JIKAN_CACHE_TTL_MS;
}

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
    const { malId, mediaType, anilistMediaId } = parsed.data;

    // Generous — the 12–24h read-through cache above does the real
    // throttling; this just stops a broken client loop from hammering Jikan.
    const { data: allowed, error: rlError } = await admin.rpc("bump_rate_limit", {
      p_user: userId,
      p_action: "series-news",
      p_limit: 30,
    });
    if (rlError) throw rlError;
    if (!allowed) {
      return json(429, { error: "Slow down a little", retryAfter: 30 });
    }

    const cached = await readCache(admin, malId, mediaType);
    if (isFresh(cached)) {
      return json(200, { items: cached, fromCache: true });
    }

    const jikanPath = mediaType === "ANIME" ? "anime" : "manga";
    const res = await fetch(`https://api.jikan.moe/v4/${jikanPath}/${malId}/news`);

    if (res.status === 429 || !res.ok) {
      // Jikan's own budget is out of our hands — serve stale cache rather
      // than a hard failure if we have anything at all.
      if (cached.length > 0) return json(200, { items: cached, fromCache: true, stale: true });
      return json(res.status === 429 ? 429 : 502, {
        error: "Couldn't reach Jikan right now.",
      });
    }

    const payload = await res.json();
    const items = (payload?.data ?? []) as JikanNewsItem[];

    const rows = items
      .filter((item) => Boolean(item.url) && Boolean(item.mal_id))
      .map((item) => ({
        source: "jikan",
        guid: String(item.mal_id),
        title: item.title || "Untitled",
        url: item.url,
        excerpt: truncate(item.excerpt),
        image_url: item.images?.jpg?.image_url ?? null,
        published_at: item.date ?? null,
        related_mal_id: malId,
        related_anilist_media_id: anilistMediaId,
        media_type: mediaType,
        fetched_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      const { error } = await admin
        .from("news_items")
        .upsert(rows, { onConflict: "source,guid" });
      if (error) throw error;
    }

    const fresh = rows.length > 0 ? await readCache(admin, malId, mediaType) : cached;
    return json(200, { items: fresh, fromCache: false });
  } catch (err) {
    captureError(err, userId);
    await flushSentry();
    return json(500, { error: "Something went wrong" });
  }
});

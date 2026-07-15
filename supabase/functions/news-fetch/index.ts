// news-fetch — RSS aggregation for the News page (§6.7).
//
// Scheduled every 30–60 min (service-role only, same auth pattern as
// drop-check — the cron scheduler sends the service role key as the
// Authorization header). Not user-facing.
//
// Copyright rule: store headline/excerpt/thumbnail/link only, never full
// article text — this is an aggregator, not a re-publisher (§6.7).
//
// Feed field names below (thumbnail location, excerpt source) are written
// defensively from the RSS/Atom spec, not verified against ANN's and
// Crunchyroll's live feeds (no outbound network access in the build
// sandbox). First thing to check in Robin's smoke test if headlines show up
// without thumbnails/excerpts — see BRIEF.md's 5c deploy notes.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Parser from "npm:rss-parser@3";
import { captureError, flushSentry } from "../_shared/sentry.ts";

interface FeedConfig {
  source: string;
  url: string;
}

// Config-driven, one file (§6.7) — add a feed by adding a row here.
// Crunchyroll retired its public RSS (https://www.crunchyroll.com/newsrss now
// 404s) — dropped 2026-07-16. ANN's "all" feed carries no images of its own, so
// thumbnails come from the AniList cover fallback below (matched series only).
const FEEDS: FeedConfig[] = [
  { source: "ann", url: "https://www.animenewsnetwork.com/all/rss.xml" },
];

const MAX_ITEMS_PER_FEED = 30;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

interface RssItem {
  guid?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
  content?: string;
  "content:encoded"?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string };
  mediaThumbnail?: { $?: { url?: string }; url?: string };
  mediaContent?: { $?: { url?: string }; url?: string };
  [key: string]: unknown;
}

/** Enclosure first, then the media: namespace tags, then a raw <img> in the
 * body as a last resort — feeds vary in which of these they actually use. */
function extractImage(item: RssItem): string | null {
  if (item.enclosure?.url) return item.enclosure.url;
  const thumb = item.mediaThumbnail?.$?.url ?? item.mediaThumbnail?.url;
  if (thumb) return thumb;
  const content = item.mediaContent?.$?.url ?? item.mediaContent?.url;
  if (content) return content;
  const html = item["content:encoded"] ?? item.content ?? "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

interface CachedTitle {
  anilist_media_id: number;
  media_type: "ANIME" | "MANGA";
  title_romaji: string | null;
  title_english: string | null;
  cover_url: string | null;
}

/**
 * Best-effort only — never fake precision (§9's spirit, applied to this
 * heuristic): flags a headline as "about" a cached title only when that
 * title appears as a case-insensitive substring and is long enough not to
 * false-positive on short/common words. Titles we don't recognize (not
 * already in media_cache — i.e. nobody has browsed or tracked them) simply
 * stay unmatched: the News page's "My series" filter shows fewer results
 * for those, never a wrong one on a miss.
 */
function matchTitle(headline: string, titles: CachedTitle[]): CachedTitle | null {
  const lower = headline.toLowerCase();
  let best: CachedTitle | null = null;
  let bestLen = 0;
  for (const t of titles) {
    for (const candidate of [t.title_english, t.title_romaji]) {
      if (!candidate || candidate.length < 6) continue;
      if (candidate.length > bestLen && lower.includes(candidate.toLowerCase())) {
        best = t;
        bestLen = candidate.length;
      }
    }
  }
  return best;
}

async function fetchFeed(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AniTrack/1.0 (+news aggregator, personal use)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function upsertFeed(
  admin: SupabaseClient,
  parser: Parser,
  feed: FeedConfig,
  titles: CachedTitle[],
): Promise<number> {
  const xml = await fetchFeed(feed.url);
  if (!xml) return 0; // one dead feed shouldn't sink the whole run

  const parsed = await parser.parseString(xml).catch(() => null);
  if (!parsed?.items) return 0;

  const rows = (parsed.items as RssItem[])
    .filter((item) => Boolean(item.link))
    .slice(0, MAX_ITEMS_PER_FEED)
    .map((item) => {
      const match = matchTitle(item.title ?? "", titles);
      return {
        source: feed.source,
        guid: item.guid || item.link!,
        title: item.title ?? "Untitled",
        url: item.link!,
        excerpt: stripHtml(item.contentSnippet ?? item.content ?? item["content:encoded"]),
        // Feed image if the source provides one; otherwise fall back to the
        // matched series' AniList cover so matched cards aren't imageless
        // (ANN carries no images — see FEEDS note). Unmatched items stay null
        // and the client collapses the thumbnail box entirely.
        image_url: extractImage(item) ?? match?.cover_url ?? null,
        published_at: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null),
        related_mal_id: null,
        related_anilist_media_id: match?.anilist_media_id ?? null,
        media_type: match?.media_type ?? null,
        fetched_at: new Date().toISOString(),
      };
    });

  if (rows.length === 0) return 0;

  const { error } = await admin
    .from("news_items")
    .upsert(rows, { onConflict: "source,guid" });
  if (error) throw error;
  return rows.length;
}

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

    // For best-effort title matching (see matchTitle) — everything anyone
    // has ever browsed or tracked, not just the caller's own library.
    const { data: titleRows, error: titleError } = await admin
      .from("media_cache")
      .select("anilist_media_id, media_type, title_romaji, title_english, cover_url");
    if (titleError) throw titleError;
    const titles = (titleRows ?? []) as CachedTitle[];

    const parser = new Parser({
      customFields: {
        item: [
          ["media:thumbnail", "mediaThumbnail"],
          ["media:content", "mediaContent"],
          ["content:encoded", "content:encoded"],
        ],
      },
    });

    let upserted = 0;
    for (const feed of FEEDS) {
      upserted += await upsertFeed(admin, parser, feed, titles);
    }

    return json(200, { feeds: FEEDS.length, upserted });
  } catch (err) {
    captureError(err);
    await flushSentry();
    return json(500, { error: "news-fetch failed" });
  }
});

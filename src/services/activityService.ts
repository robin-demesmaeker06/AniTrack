// Recent activity feed (§6.1), joined client-side with media_cache for
// titles and covers — same pattern as the library list.
import { getSupabase } from "./supabaseClient";
import type { ActivityAction, ActivityItem, Media, MediaType } from "@/types";

interface ActivityRow {
  id: string;
  user_id: string;
  action: ActivityAction;
  anilist_media_id: number;
  media_type: MediaType;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface ActivityWithMedia {
  activity: ActivityItem;
  media: Media | null;
}

export async function getRecentActivity(
  userId: string,
  limit = 20,
): Promise<ActivityWithMedia[]> {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const activities = (rows as ActivityRow[]).map(
    (row): ActivityItem => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      anilistMediaId: row.anilist_media_id,
      mediaType: row.media_type,
      detail: row.detail ?? {},
      createdAt: row.created_at,
    }),
  );
  if (activities.length === 0) return [];

  const ids = [...new Set(activities.map((a) => a.anilistMediaId))];
  const { data: mediaRows, error: mediaError } = await supabase
    .from("media_cache")
    .select("anilist_media_id, media_type, title_romaji, title_english, title_native, cover_url")
    .in("anilist_media_id", ids);
  if (mediaError) throw mediaError;

  const mediaMap = new Map<string, Partial<Media>>();
  for (const row of mediaRows ?? []) {
    mediaMap.set(`${row.media_type}:${row.anilist_media_id}`, {
      anilistMediaId: row.anilist_media_id as number,
      mediaType: row.media_type as MediaType,
      titles: {
        romaji: row.title_romaji as string | null,
        english: row.title_english as string | null,
        native: row.title_native as string | null,
      },
      coverUrl: row.cover_url as string | null,
    });
  }

  return activities.map((activity) => ({
    activity,
    media:
      (mediaMap.get(`${activity.mediaType}:${activity.anilistMediaId}`) as Media) ??
      null,
  }));
}

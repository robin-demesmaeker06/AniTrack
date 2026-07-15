// Library CRUD + activity logging (§6.4). Every change is persisted to
// Supabase and diffed into activity_log; AniList write-through hooks in
// here in Phase 6 — callers won't change.
import { getSupabase } from "./supabaseClient";
import type {
  ActivityAction,
  EntryStatus,
  LibraryEntry,
  Media,
  MediaType,
} from "@/types";

// ---------------------------------------------------------------- mapping

interface EntryRow {
  id: string;
  user_id: string;
  anilist_media_id: number;
  media_type: MediaType;
  status: EntryStatus;
  progress: number;
  progress_volumes: number | null;
  score: number | null;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  anilist_entry_id: number | null;
  synced_at: string | null;
}

function toEntry(row: EntryRow): LibraryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    anilistMediaId: row.anilist_media_id,
    mediaType: row.media_type,
    status: row.status,
    progress: row.progress,
    progressVolumes: row.progress_volumes,
    score: row.score,
    notes: row.notes,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    anilistEntryId: row.anilist_entry_id,
    syncedAt: row.synced_at,
  };
}

interface CacheRow {
  anilist_media_id: number;
  media_type: MediaType;
  mal_id: number | null;
  title_romaji: string | null;
  title_english: string | null;
  title_native: string | null;
  cover_url: string | null;
  banner_url: string | null;
  format: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  airing_status: string | null;
  genres: string[];
  average_score: number | null;
  season: string | null;
  season_year: number | null;
  next_airing_episode: number | null;
  next_airing_at: string | null;
  cached_at: string;
}

function cacheRowToMedia(row: CacheRow): Media {
  return {
    anilistMediaId: row.anilist_media_id,
    mediaType: row.media_type,
    malId: row.mal_id,
    titles: {
      romaji: row.title_romaji,
      english: row.title_english,
      native: row.title_native,
    },
    coverUrl: row.cover_url,
    bannerUrl: row.banner_url,
    format: row.format,
    episodes: row.episodes,
    chapters: row.chapters,
    volumes: row.volumes,
    airingStatus: row.airing_status,
    genres: row.genres ?? [],
    averageScore: row.average_score,
    season: row.season,
    seasonYear: row.season_year,
    nextAiringEpisode: row.next_airing_episode,
    nextAiringAt: row.next_airing_at,
    cachedAt: row.cached_at,
  };
}

// ---------------------------------------------------------------- activity

interface ActivityInsert {
  user_id: string;
  action: ActivityAction;
  anilist_media_id: number;
  media_type: MediaType;
  detail: Record<string, unknown>;
}

async function logActivity(rows: ActivityInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await getSupabase().from("activity_log").insert(rows);
  // Activity is best-effort — never fail the tracking action over it.
  if (error) console.warn("activity_log insert failed:", error.message);
}

// ---------------------------------------------------------------- lookup

export interface LibraryLookupEntry {
  anilistMediaId: number;
  mediaType: MediaType;
  status: EntryStatus;
}

export async function getLibraryLookup(
  userId: string,
): Promise<LibraryLookupEntry[]> {
  const { data, error } = await getSupabase()
    .from("library_entries")
    .select("anilist_media_id, media_type, status")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    anilistMediaId: row.anilist_media_id as number,
    mediaType: row.media_type as MediaType,
    status: row.status as EntryStatus,
  }));
}

// ---------------------------------------------------------------- CRUD

export async function getEntry(
  userId: string,
  mediaType: MediaType,
  anilistMediaId: number,
): Promise<LibraryEntry | null> {
  const { data, error } = await getSupabase()
    .from("library_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("media_type", mediaType)
    .eq("anilist_media_id", anilistMediaId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEntry(data as EntryRow) : null;
}

export async function addEntry(
  userId: string,
  media: Media,
  status: EntryStatus,
): Promise<LibraryEntry> {
  const insert: Record<string, unknown> = {
    user_id: userId,
    anilist_media_id: media.anilistMediaId,
    media_type: media.mediaType,
    status,
  };
  if (status === "CURRENT") {
    insert.started_at = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await getSupabase()
    .from("library_entries")
    .insert(insert)
    .select()
    .single();
  if (error) throw error;

  await logActivity([
    {
      user_id: userId,
      action: "added",
      anilist_media_id: media.anilistMediaId,
      media_type: media.mediaType,
      detail: { status },
    },
  ]);
  return toEntry(data as EntryRow);
}

export interface EntryChanges {
  status?: EntryStatus;
  progress?: number;
  progressVolumes?: number | null;
  score?: number | null;
  notes?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export async function updateEntry(
  current: LibraryEntry,
  changes: EntryChanges,
  progressTotal?: number | null,
): Promise<LibraryEntry> {
  const row: Record<string, unknown> = {};
  if (changes.status !== undefined) row.status = changes.status;
  if (changes.progress !== undefined) row.progress = changes.progress;
  if (changes.progressVolumes !== undefined) row.progress_volumes = changes.progressVolumes;
  if (changes.score !== undefined) row.score = changes.score;
  if (changes.notes !== undefined) row.notes = changes.notes;
  if (changes.startedAt !== undefined) row.started_at = changes.startedAt;
  if (changes.finishedAt !== undefined) row.finished_at = changes.finishedAt;

  // Sensible autofills, AniList-style.
  const today = new Date().toISOString().slice(0, 10);
  if (changes.status === "CURRENT" && !current.startedAt && changes.startedAt === undefined) {
    row.started_at = today;
  }
  if (changes.status === "COMPLETED") {
    if (!current.finishedAt && changes.finishedAt === undefined) row.finished_at = today;
    if (progressTotal && changes.progress === undefined) row.progress = progressTotal;
  }

  const { data, error } = await getSupabase()
    .from("library_entries")
    .update(row)
    .eq("id", current.id)
    .select()
    .single();
  if (error) throw error;
  const updated = toEntry(data as EntryRow);

  // Diff → activity rows (§6.4).
  const activity: ActivityInsert[] = [];
  const base = {
    user_id: current.userId,
    anilist_media_id: current.anilistMediaId,
    media_type: current.mediaType,
  };
  if (updated.status !== current.status) {
    activity.push({
      ...base,
      action: "status_change",
      detail: { from: current.status, to: updated.status },
    });
  }
  if (updated.progress !== current.progress) {
    activity.push({
      ...base,
      action: "progress",
      detail: { progress: updated.progress, total: progressTotal ?? null },
    });
  }
  if (updated.score !== current.score) {
    activity.push({ ...base, action: "score", detail: { score: updated.score } });
  }
  await logActivity(activity);

  return updated;
}

export async function removeEntry(entry: LibraryEntry): Promise<void> {
  const { error } = await getSupabase()
    .from("library_entries")
    .delete()
    .eq("id", entry.id);
  if (error) throw error;
}

// ---------------------------------------------------------------- list

export interface LibraryListItem {
  entry: LibraryEntry;
  media: Media | null;
}

/** All entries with their cached media, for the profile library (§6.5). */
export async function getLibraryList(
  userId: string,
): Promise<LibraryListItem[]> {
  const supabase = getSupabase();
  const { data: entryRows, error } = await supabase
    .from("library_entries")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const entries = (entryRows as EntryRow[]).map(toEntry);
  if (entries.length === 0) return [];

  const ids = [...new Set(entries.map((e) => e.anilistMediaId))];
  const { data: mediaRows, error: mediaError } = await supabase
    .from("media_cache")
    .select(
      "anilist_media_id, media_type, mal_id, title_romaji, title_english, title_native, cover_url, banner_url, format, episodes, chapters, volumes, airing_status, genres, average_score, season, season_year, next_airing_episode, next_airing_at, cached_at",
    )
    .in("anilist_media_id", ids);
  if (mediaError) throw mediaError;

  const mediaMap = new Map<string, Media>();
  for (const row of (mediaRows ?? []) as CacheRow[]) {
    mediaMap.set(
      `${row.media_type}:${row.anilist_media_id}`,
      cacheRowToMedia(row),
    );
  }

  return entries.map((entry) => ({
    entry,
    media: mediaMap.get(`${entry.mediaType}:${entry.anilistMediaId}`) ?? null,
  }));
}

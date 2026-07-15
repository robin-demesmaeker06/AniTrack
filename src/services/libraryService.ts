// Phase 2 scope: read-only lookup so Explore/detail can badge "in library".
// Full CRUD (the tracking widget) lands in Phase 3.
import { getSupabase } from "./supabaseClient";
import type { EntryStatus, MediaType } from "@/types";

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

import type { Profile, ProfileUpdate } from "@/types";
import { getSupabase } from "./supabaseClient";

interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  title_language: Profile["titleLanguage"];
  score_format: Profile["scoreFormat"];
  theme: Profile["theme"];
  created_at: string;
  updated_at: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    titleLanguage: row.title_language,
    scoreFormat: row.score_format,
    theme: row.theme,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function updateProfile(
  userId: string,
  update: ProfileUpdate,
): Promise<Profile> {
  const row: Record<string, unknown> = {};
  if (update.username !== undefined) row.username = update.username;
  if (update.avatarUrl !== undefined) row.avatar_url = update.avatarUrl;
  if (update.titleLanguage !== undefined) row.title_language = update.titleLanguage;
  if (update.scoreFormat !== undefined) row.score_format = update.scoreFormat;
  if (update.theme !== undefined) row.theme = update.theme;

  const { data, error } = await getSupabase()
    .from("profiles")
    .update(row)
    .eq("id", userId)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is taken.");
    }
    if (error.code === "23514") {
      throw new Error(
        "Usernames are 3–20 characters: letters, numbers, underscores.",
      );
    }
    throw error;
  }
  return toProfile(data as ProfileRow);
}

/** GDPR export (§8): every row the user owns, as one JSON document. */
export async function exportUserData(userId: string): Promise<Blob> {
  const supabase = getSupabase();
  const [profile, library, activity, notifications, anilist] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId),
      supabase.from("library_entries").select("*").eq("user_id", userId),
      supabase.from("activity_log").select("*").eq("user_id", userId),
      supabase.from("notifications").select("*").eq("user_id", userId),
      supabase
        .from("anilist_connections")
        .select("user_id, anilist_user_id, expires_at, last_synced_at, sync_enabled, created_at")
        .eq("user_id", userId),
    ]);

  for (const result of [profile, library, activity, notifications, anilist]) {
    if (result.error) throw result.error;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: profile.data,
    libraryEntries: library.data,
    activityLog: activity.data,
    notifications: notifications.data,
    anilistConnection: anilist.data,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

/** Wipes the account via the delete-account Edge Function. Irreversible. */
export async function deleteAccount(): Promise<void> {
  const { error } = await getSupabase().functions.invoke("delete-account", {
    body: { confirm: true },
  });
  if (error) throw error;
}

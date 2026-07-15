// Notification reads + mark-as-read (§6.6). Rows are created by the
// drop-check Edge Function (service role); the client only reads and
// flips the read flag. Push/email later hangs off the same table.
import { getSupabase } from "./supabaseClient";
import type { AppNotification, NotificationType } from "@/types";

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  anilist_media_id: number | null;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    anilistMediaId: row.anilist_media_id,
    payload: row.payload ?? {},
    read: row.read,
    createdAt: row.created_at,
  };
}

/** Latest 50 — the center is a feed, not an archive. */
export async function getNotifications(
  userId: string,
): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as NotificationRow[]).map(toNotification);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .update({ read: true })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRead(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}

// AniList account link + one-way import (§Phase 6). The OAuth authorize step
// is a full-page redirect to anilist.co; the code exchange and the import both
// go through the anilist-link Edge Function (it holds the client secret and the
// token encryption key). Link status is read straight from anilist_connections
// via RLS (token column is not granted to the client); unlink is an RLS delete
// that leaves local library rows intact.
import { getSupabase } from "./supabaseClient";
import type { AnilistConnection, ImportResult } from "@/types";

const AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";
const clientId = import.meta.env.VITE_ANILIST_CLIENT_ID as string | undefined;

/** Redirect URI must match one registered on the AniList API client exactly. */
export function anilistRedirectUri(): string {
  return `${window.location.origin}/anilist/callback`;
}

export function isAnilistConfigured(): boolean {
  return Boolean(clientId);
}

/** Full-page redirect into AniList's consent screen (authorization code grant). */
export function startAnilistAuth(): void {
  if (!clientId) {
    throw new Error("AniList linking isn't configured (missing VITE_ANILIST_CLIENT_ID).");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: anilistRedirectUri(),
    response_type: "code",
  });
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

async function invokeLink<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke("anilist-link", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.json().catch(() => null);
      if (payload?.error) {
        throw new Error(
          payload.retryAfter
            ? `${payload.error} — try again in ~${payload.retryAfter}s.`
            : payload.error,
        );
      }
    }
    throw new Error("Couldn't reach AniList. Try again in a moment.");
  }
  return data as T;
}

/** Current link status, or null if the account isn't linked. */
export async function getAnilistConnection(): Promise<AnilistConnection | null> {
  const { data, error } = await getSupabase()
    .from("anilist_connections")
    .select("anilist_user_id, expires_at, last_synced_at, sync_enabled, created_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    anilistUserId: data.anilist_user_id,
    expiresAt: data.expires_at,
    lastSyncedAt: data.last_synced_at,
    syncEnabled: data.sync_enabled,
    createdAt: data.created_at,
  };
}

/** Exchange the OAuth code (from the callback) for a stored, encrypted token. */
export async function exchangeAnilistCode(
  code: string,
): Promise<{ anilistUserId: number; name: string | null }> {
  return invokeLink({ action: "exchange", code, redirectUri: anilistRedirectUri() });
}

/** Pull the linked account's AniList lists into the local library. */
export async function importAnilistLibrary(): Promise<ImportResult> {
  return invokeLink({ action: "import" });
}

/** Remove the AniList link. Local library rows are left untouched. */
export async function unlinkAnilist(): Promise<void> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("You're not signed in.");
  const { error } = await sb.from("anilist_connections").delete().eq("user_id", user.id);
  if (error) throw error;
}

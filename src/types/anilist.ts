/** Link status for the user's AniList account (§Phase 6). Mirrors the
 * client-readable columns of anilist_connections — the access_token column is
 * service-role-only and never reaches the client. */
export interface AnilistConnection {
  anilistUserId: number;
  expiresAt: string | null;
  lastSyncedAt: string | null;
  syncEnabled: boolean;
  createdAt: string;
}

/** Result of a one-way import from AniList into the local library. */
export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

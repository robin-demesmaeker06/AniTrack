// sync-push — the scheduled two-way push job (§Phase 6, 6b).
//
// Drains anilist_sync_queue: for each due row it writes the user's local edit
// back to AniList and clears the row, or backs it off on failure. The queue is
// populated client-side (enqueue_anilist_sync) on every library edit, deduped
// to one pending push per media — so we always send the *current* local state,
// never a stale snapshot.
//
//   upsert → read the live library_entries row, SaveMediaListEntry, then store
//            the returned AniList entry id + synced_at back on the local row.
//   delete → DeleteMediaListEntry(anilist_entry_id) (no-op if the entry never
//            existed remotely).
//
// Retry ladder: on failure the row's attempts++ and next_attempt_at backs off;
// after MAX_ATTEMPTS the pusher gives up — it drops the row and raises one
// SYNC_ERROR notification (deduped per media via notifications_dedupe_idx).
// A 429 from AniList stops the run cleanly; the untouched rows retry next time.
//
// Not user-facing: callers must present the service-role key (the cron
// scheduler adds it as the Authorization header) — same contract as drop-check.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { captureError, flushSentry } from "../_shared/sentry.ts";

const ANILIST_URL = "https://graphql.anilist.co";

/** Max queue rows touched per run — keeps us inside AniList's ~30/min budget. */
const MAX_PER_RUN = 25;
/** Give up (SYNC_ERROR) once a row has failed this many times. */
const MAX_ATTEMPTS = 5;
/** Backoff ladder in minutes, indexed by the attempt just failed (1-based). */
const BACKOFF_MINUTES = [2, 5, 15, 60];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------- token crypto
// AES-GCM, 32-byte key from env (base64). Value layout is
// base64(iv[12] || ciphertext+tag). Deliberately duplicated from anilist-link
// rather than shared (matches the codebase's per-function-fragment pattern —
// see the MEDIA_FIELDS duplication in anilist/drop-check).

async function tokenKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get("ANILIST_TOKEN_KEY");
  if (!b64) throw new Error("ANILIST_TOKEN_KEY not set");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) {
    throw new Error("ANILIST_TOKEN_KEY must be 32 bytes, base64-encoded");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
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

async function anilistMutate(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<Record<string, any>> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
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

const SAVE_MUTATION = `
mutation Save(
  $mediaId: Int, $status: MediaListStatus, $progress: Int,
  $progressVolumes: Int, $scoreRaw: Int, $notes: String,
  $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput
) {
  SaveMediaListEntry(
    mediaId: $mediaId, status: $status, progress: $progress,
    progressVolumes: $progressVolumes, scoreRaw: $scoreRaw, notes: $notes,
    startedAt: $startedAt, completedAt: $completedAt
  ) { id }
}`;

const DELETE_MUTATION = `
mutation Del($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }`;

interface FuzzyDateInput {
  year: number;
  month: number;
  day: number;
}
/** "YYYY-MM-DD" → AniList FuzzyDateInput, or null for an unparseable/absent date. */
function dateToFuzzy(d: string | null): FuzzyDateInput | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return null;
  return { year: y, month: m, day };
}

// ---------------------------------------------------------------- rows

interface QueueRow {
  id: string;
  user_id: string;
  anilist_media_id: number;
  media_type: "ANIME" | "MANGA";
  operation: "upsert" | "delete";
  anilist_entry_id: number | null;
  attempts: number;
}

interface EntryRow {
  id: string;
  status: string;
  progress: number;
  progress_volumes: number | null;
  score: number | null;
  notes: string | null;
  started_at: string | null;
  finished_at: string | null;
  anilist_entry_id: number | null;
}

interface Connection {
  token: string | null; // decrypted, or null when the user has no active link
  syncEnabled: boolean;
}

/**
 * Build SaveMediaListEntry variables from a local entry. Conservative on the
 * fields AniList could destructively clear: score and dates are only sent when
 * we actually hold a value, so a bare progress bump never wipes a remote score
 * or start/finish date. status and progress are always authoritative.
 */
function saveVariables(mediaId: number, mediaType: "ANIME" | "MANGA", e: EntryRow) {
  const vars: Record<string, unknown> = {
    mediaId,
    status: e.status,
    progress: e.progress,
  };
  if (mediaType === "MANGA" && e.progress_volumes != null) {
    vars.progressVolumes = e.progress_volumes;
  }
  if (e.score != null) vars.scoreRaw = e.score; // stored 0–100 == scoreRaw
  if (e.notes != null) vars.notes = e.notes;
  const started = dateToFuzzy(e.started_at);
  const completed = dateToFuzzy(e.finished_at);
  if (started) vars.startedAt = started;
  if (completed) vars.completedAt = completed;
  return vars;
}

function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1];
}

// ---------------------------------------------------------------- handler

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
    const admin: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Due rows, oldest first. Cap per run for the AniList budget.
    const { data: dueRows, error: dueError } = await admin
      .from("anilist_sync_queue")
      .select("id, user_id, anilist_media_id, media_type, operation, anilist_entry_id, attempts")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(MAX_PER_RUN);
    if (dueError) throw dueError;
    const queue = (dueRows ?? []) as QueueRow[];
    if (queue.length === 0) {
      return json(200, { processed: 0, pushed: 0, failed: 0, gaveUp: 0, dropped: 0 });
    }

    // Resolve each involved user's connection once, decrypting the token.
    const userIds = [...new Set(queue.map((r) => r.user_id))];
    const { data: connRows, error: connError } = await admin
      .from("anilist_connections")
      .select("user_id, access_token, sync_enabled")
      .in("user_id", userIds);
    if (connError) throw connError;
    const connections = new Map<string, Connection>();
    for (const c of connRows ?? []) {
      connections.set(c.user_id as string, {
        token: c.access_token ? await decryptToken(c.access_token as string) : null,
        syncEnabled: Boolean(c.sync_enabled),
      });
    }

    let pushed = 0;
    let failed = 0;
    let gaveUp = 0;
    let dropped = 0;
    const giveUpNotes: Array<{
      user_id: string;
      type: "SYNC_ERROR";
      anilist_media_id: number;
      payload: Record<string, unknown>;
    }> = [];
    let rateLimited = false;

    for (const row of queue) {
      const conn = connections.get(row.user_id);
      // No active, sync-enabled link (unlinked or toggled off after enqueue):
      // there's nothing to push — drop the row.
      if (!conn || !conn.token || !conn.syncEnabled) {
        await admin.from("anilist_sync_queue").delete().eq("id", row.id);
        dropped++;
        continue;
      }

      try {
        if (row.operation === "delete") {
          if (row.anilist_entry_id != null) {
            await anilistMutate(DELETE_MUTATION, { id: row.anilist_entry_id }, conn.token);
          }
          // No remote entry id → it was never on AniList; nothing to do.
        } else {
          // upsert: push the *live* local state, not a queued snapshot.
          const { data: entry, error: entryError } = await admin
            .from("library_entries")
            .select("id, status, progress, progress_volumes, score, notes, started_at, finished_at, anilist_entry_id")
            .eq("user_id", row.user_id)
            .eq("anilist_media_id", row.anilist_media_id)
            .eq("media_type", row.media_type)
            .maybeSingle();
          if (entryError) throw entryError;

          if (!entry) {
            // Row was removed between enqueue and now. If we know the remote
            // entry id, mirror the delete; otherwise just drop.
            if (row.anilist_entry_id != null) {
              await anilistMutate(DELETE_MUTATION, { id: row.anilist_entry_id }, conn.token);
            }
          } else {
            const e = entry as EntryRow;
            const data = await anilistMutate(
              SAVE_MUTATION,
              saveVariables(row.anilist_media_id, row.media_type, e),
              conn.token,
            );
            const savedId = data?.SaveMediaListEntry?.id ?? null;
            await admin
              .from("library_entries")
              .update({
                anilist_entry_id: savedId ?? e.anilist_entry_id,
                synced_at: new Date().toISOString(),
              })
              .eq("id", e.id);
          }
        }

        await admin.from("anilist_sync_queue").delete().eq("id", row.id);
        pushed++;
      } catch (err) {
        if (err instanceof RateLimited) {
          // Stop the whole run — don't burn attempts on a global throttle.
          rateLimited = true;
          break;
        }
        const attempts = row.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        if (attempts >= MAX_ATTEMPTS) {
          // Give up: pull the title for the notification, drop the row, notify.
          const { data: media } = await admin
            .from("media_cache")
            .select("title_english, title_romaji")
            .eq("anilist_media_id", row.anilist_media_id)
            .eq("media_type", row.media_type)
            .maybeSingle();
          const title =
            (media?.title_english as string) ?? (media?.title_romaji as string) ?? "a title";
          giveUpNotes.push({
            user_id: row.user_id,
            type: "SYNC_ERROR",
            anilist_media_id: row.anilist_media_id,
            // "number" is a stable marker so repeat give-ups for the same media
            // dedupe through notifications_dedupe_idx instead of piling up.
            payload: { number: "sync", title, mediaType: row.media_type, reason: message },
          });
          await admin.from("anilist_sync_queue").delete().eq("id", row.id);
          gaveUp++;
        } else {
          await admin
            .from("anilist_sync_queue")
            .update({
              attempts,
              last_error: message.slice(0, 500),
              next_attempt_at: new Date(
                Date.now() + backoffMinutes(attempts) * 60_000,
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          failed++;
        }
      }
    }

    if (giveUpNotes.length > 0) {
      const { error: notifyError } = await admin.rpc("insert_notifications", {
        p_items: giveUpNotes,
      });
      if (notifyError) throw notifyError;
    }

    return json(200, {
      processed: pushed + failed + gaveUp + dropped,
      pushed,
      failed,
      gaveUp,
      dropped,
      ...(rateLimited ? { note: "AniList 429 — stopped early, remaining rows retry next run" } : {}),
    });
  } catch (err) {
    captureError(err);
    await flushSentry();
    return json(500, { error: "sync-push failed" });
  }
});

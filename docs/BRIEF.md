# AniTrack — working brief

The full product spec lives in the original build prompt (chat, 2026-07-14).
This file records what's decided and where the build stands, so any session
can pick up without the chat history.

## §0 decisions (2026-07-14)

| Question | Answer |
|---|---|
| Name | AniTrack |
| Vibe | Dark-first, cool teal / signal cyan accent, cover-art-forward |
| Score display default | 10-point with decimals (stored 0–100 internally, always) |
| Default title language | English (romaji/native user-overridable) |
| Google sign-in | Yes, alongside email + password |
| Manga chapter drops | Approximation accepted: diff `chapters` on RELEASING manga, notify as "Updated", never fake precision |

## Phase tracker

1. ✅ Scaffold, Supabase schema (7 tables + RLS + auth), base layout/nav, theme, profile settings — done + smoke-tested 2026-07-14
2. ✅ AniList client + `media_cache`, Explore (anime/manga) with URL-driven filters, media detail page (read-only) — **built 2026-07-14, awaiting Robin's smoke test.** All AniList traffic flows through the `anilist` Edge Function (browse/detail): per-user rate limits via `bump_rate_limit`, 429/Retry-After passthrough, media_cache upserts with 1h/24h TTL. Client detail reads try the public media_cache row first.
3. ✅ Library tracking — **built 2026-07-15, awaiting Robin's smoke test.** TrackingWidget on media detail (add/remove, status, progress/volume steppers, score in user format, dates, notes, "Completed?" suggestion, AniList-style autofills), diff-based activity_log writes in libraryService, LibraryView on Profile (status tabs + counts, anime/manga switch, grid/list, sort, inline +1 and score edit). All mutations optimistic. Phase 6 write-through hooks into updateEntry/addEntry without caller changes.
4. ✅ Home dashboard — **built 2026-07-15, awaiting Robin's smoke test.** Continue rail (one-tap +1, "Done?" at total, shared optimistic library-list cache), New drops computed client-side from media_cache (anime precise via next_airing_episode, manga "Updated" per §9, RELEASING only — Phase 5's job supplies freshness), activity feed with per-action rendering + relative timestamps.
5. ◐ Split into 5a/5b/5c (2026-07-15):
   - 5a ✅ Schedule page + drop-detection job + notifications center — **built 2026-07-15, awaiting Robin's smoke test.** Schedule: new `schedule` action on the anilist function (airingSchedules, server-side pagination, adult filter), rolling 7-day window, day-strip tabs (mobile) / seven columns (desktop), local timezone, countdowns on today, All vs My list toggle with library highlighting. Drop detection: `drop-check` Edge Function (service-role only) refreshes media_cache for every CURRENT/PLANNING series and inserts NEW_EPISODE / NEW_CHAPTER ("Updated") notifications via the new `insert_notifications` RPC — idempotent through `notifications_dedupe_idx`. This same refresh keeps Home's "New drops" fresh. Notifications center: floating bell with unread badge (60s poll), dropdown panel, mark-one/mark-all-read (optimistic), click-through to the media page.
   - 5b ⬜ Stats dashboard
   - 5c ⬜ News page + aggregation pipeline
6. ⬜ AniList OAuth link, import, two-way sync with failure queue
7. ⬜ Polish: empty/error/loading states, a11y, mobile ergonomics, §8 security verification

Each phase must leave the app working and deployable. Confirm with Robin
after each phase before starting the next.

## Non-negotiables (from the brief)

- Services layer isolation: UI never calls fetch/Supabase directly; domain
  types React-free — the Expo app later reuses both.
- AniList API: ~30 req/min budget, honor `Retry-After`, back off on 429,
  cache in `media_cache` (TTL 24h finished / 1h airing).
- Sanitize AniList HTML with DOMPurify; no `dangerouslySetInnerHTML` on raw
  content.
- Secrets only in Edge Function env. Anon key is the only key in the bundle
  (`npm run check:bundle` enforces).
- RLS default deny on every table; verify with `supabase/tests/rls_check.sql`.
- News: store headline/excerpt/thumbnail/link only — aggregator, not
  re-publisher. RSS list is config-driven (ANN + Crunchyroll News to start);
  Jikan per-series news throttled ~1 req/s, 12–24h cache, lazy fetch.
- Notifications idempotent via unique index on (user, media, type,
  payload->>'number').
- AniList sync (Phase 6): OAuth code exchange in Edge Function, tokens
  encrypted at rest, local writes always succeed, conflict = newest
  `updated_at` wins, unlink keeps local data.

## Phase 5 spec extract (from the original prompt — chat won't be available)

**Schedule (§6.2):** weekly airing calendar from AniList `airingSchedules`.
Swipeable day tabs on mobile, seven-column week on desktop. Times in the
user's local timezone (default Europe/Brussels), countdown for today's
upcoming episodes, episode numbers ("Ep 8"). Toggle: All airing vs My list
only; highlight library entries. Candidate for the §10 signature element
(day-strip).

**Notifications (§6.6):** bell icon + in-app center fed by the
`notifications` table; mark-as-read + mark-all-read. Design so push/email
later is an addition, not a rewrite. Drop detection: scheduled Edge Function
every 30–60 min — refresh `media_cache` for every airing/releasing series in
at least one user's library; anime: compare latest aired episode vs each
user's progress → NEW_EPISODE; manga: §9 chapter-diff → NEW_CHAPTER labeled
"Updated". Idempotent via the existing `notifications_dedupe_idx` (payload
carries the episode/chapter under key "number"). This job is also what keeps
Home's "New drops" fresh — one pipeline. Cron scheduling: Supabase
`pg_cron` + `pg_net` calling the function, or the dashboard scheduler.

**Stats dashboard (§6.5):** total episodes watched, chapters read, estimated
days watched, mean score, status distribution, genre breakdown chart — from
`library_entries` joined with `media_cache`.

**News (§6.7):** RSS list config-driven in ONE file (start: Anime News
Network newsfeed, Crunchyroll News). Scheduled function every 30–60 min:
fetch, parse, strip HTML from excerpts, dedupe on (source, guid), upsert
into `news_items`. Jikan (api.jikan.moe/v4) per-series news via
`/anime/{mal_id}/news` + `/manga/{mal_id}/news` using media_cache.mal_id —
~1 req/s, lazy fetch on media-page open, 12–24h TTL. Surfaces: News page
(reverse-chron cards: thumb, headline, excerpt, source badge, relative time,
outbound link; All vs My series filter via related_anilist_media_id), News
tab on media detail (Jikan), compact "News on your series" strip on Home.
Copyright rule: headline/excerpt/thumb/link only, never full text — send
traffic out. News page also needs a nav slot (5th tab or under Home).

## Design direction

Dark-first, artwork does the talking, chrome stays quiet. Fonts: Syne
(display), Manrope (body), IBM Plex Mono for episode numbers / countdowns /
timestamps (the "broadcast" detail — `.numeric` class). Signature element:
the Schedule day-strip (chosen and built in 5a — mono day numbers, per-day
episode counts, today ring). Skeleton loaders everywhere, optimistic
updates on all tracking actions, plain active language in empty/error states.

## Robin's 5a deploy steps

1. Run `supabase/migrations/20260715120000_phase5_drop_check.sql` in the SQL
   editor (adds `insert_notifications`).
2. Redeploy the `anilist` function (new `schedule` action) and deploy the new
   `drop-check` function: `supabase functions deploy anilist drop-check`.
3. Schedule drop-check every 30 min — easiest via dashboard: Integrations →
   Cron → Edge Function job, `*/30 * * * *`, Authorization header
   `Bearer <service role key>`. (pg_cron alternative is commented in the
   migration.)
4. Smoke test: Schedule page (both scopes, mobile + desktop widths), then
   invoke drop-check once by hand (curl with the service key) and check the
   bell fills with drops for your library.
5. Commit + push (manual — sandbox git is read-only on this repo).

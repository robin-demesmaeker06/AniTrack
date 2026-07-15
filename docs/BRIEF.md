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
5. ⬜ Schedule page, notifications center + drop-detection job, stats dashboard, News page + aggregation pipeline
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

## Design direction

Dark-first, artwork does the talking, chrome stays quiet. Fonts: Syne
(display), Manrope (body), IBM Plex Mono for episode numbers / countdowns /
timestamps (the "broadcast" detail — `.numeric` class). Signature element
candidates: Schedule day-strip or the +1 progress interaction — pick ONE and
execute it well in its phase. Skeleton loaders everywhere, optimistic
updates on all tracking actions, plain active language in empty/error states.

# AniTrack

Anime & manga tracker: watch/read progress, discovery, airing calendar, drop
notifications, news, stats, and optional two-way AniList sync. Standalone
accounts, web-first, architected so an Expo/React Native app can later reuse the
same backend and services layer.

**Status: Phase 6 of 7 complete.** Phases 1–6 are deployed and live, including
AniList OAuth link, library import, and two-way push sync (verified end to end
2026-07-29). Phase 7 is polish. Phase order and per-phase deploy steps live in
`docs/BRIEF.md`.

## What's in it

| Area | Where |
|---|---|
| Home: continue rail, new drops, activity feed | `src/features/home` |
| Explore: search, filters, infinite scroll, media detail | `src/features/explore`, `src/features/media` |
| Library: status tabs, grid/list views, tracking widget | `src/features/library`, `src/features/profile` |
| Schedule: rolling 7-day airing calendar | `src/features/schedule` |
| Notifications: bell, unread badge, drop alerts | `src/features/notifications` |
| Stats: episodes, chapters, mean score, top genres | `src/features/stats` |
| News: ANN feed + per-series Jikan | `src/features/news` |
| AniList link / import / push sync | `src/features/profile`, `src/services/anilistLinkService.ts` |

## Stack

React 19 + TypeScript + Tailwind 4 + TanStack Query + React Router 7, on
Supabase (Auth, Postgres + RLS, Edge Functions). Metadata from the AniList
GraphQL API, per-series news from Jikan, headlines from Anime News Network's RSS.
Sentry for error monitoring.

Architecture rules that keep the future mobile app cheap:

- All data access lives in `src/services/` — components never touch fetch or
  the Supabase client directly.
- Domain types in `src/types/` have zero React imports.
- Feature folders under `src/features/`, not one giant pages folder.
- No secrets in the frontend bundle — anon key only, verified by
  `npm run check:bundle` after every build.

## Setup

### 1. Supabase project

1. Create a project at [database.new](https://database.new) (EU region:
   `eu-central-1` is closest).
2. In the dashboard, open **SQL Editor** and run every file in
   `supabase/migrations/` in filename order:
   - `20260714120000_init.sql` — 7 tables, RLS, signup trigger
   - `20260714200000_phase2_rate_limits.sql` — `edge_rate_limits` + `bump_rate_limit`
   - `20260715120000_phase5_drop_check.sql` — `insert_notifications` RPC
   - `20260715130000_phase5_duration_and_news.sql` — `media_cache.duration`, news index
   - `20260721120000_phase6b_sync_push.sql` — `anilist_sync_queue` + `enqueue_anilist_sync`

   (Alternative: `supabase init` + `supabase link` + `supabase db push`.)
3. **Authentication → URL Configuration**: set Site URL to
   `http://localhost:5173`, and add `http://localhost:5173/auth/callback`
   and `http://localhost:5173/reset-password` to Redirect URLs. Add your
   production domain equivalents when you deploy.
4. **Authentication → Providers → Email**: leave "Confirm email" ON.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com), create OAuth
   2.0 credentials (Web application).
2. Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
3. Paste client ID + secret in Supabase **Authentication → Providers → Google**.

The app works with email + password alone until this is done — the Google
button will just error.

### 3. Edge Functions

```sh
supabase functions deploy delete-account   # account deletion
supabase functions deploy anilist          # AniList gateway: browse, detail, schedule
supabase functions deploy drop-check       # scheduled: new episode/chapter notifications
supabase functions deploy news-fetch       # scheduled: ANN RSS ingest
supabase functions deploy series-news      # per-series Jikan news, lazy
supabase functions deploy anilist-link     # Phase 6a: OAuth exchange + library import
supabase functions deploy sync-push        # Phase 6b: scheduled outbox drain → AniList

# optional, for error monitoring:
supabase secrets set SENTRY_DSN=your-edge-dsn
```

`anilist` is the app's only gateway to AniList: it caches every media object
into `media_cache` (TTL 1h airing / 24h finished), enforces per-user rate
limits, and honors AniList's Retry-After.

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. The
service-role key never leaves Supabase's servers.

#### Scheduled jobs

Three functions run on cron (dashboard → Integrations → Cron → Edge Function job):

| Function | Cadence | Does |
|---|---|---|
| `drop-check` | `*/30 * * * *` | Refresh airing series, emit NEW_EPISODE / NEW_CHAPTER notifications |
| `news-fetch` | `*/30 * * * *` | Pull ANN's RSS into `news_items` |
| `sync-push` | `*/5 * * * *` | Drain `anilist_sync_queue` → AniList (Phase 6b) |

All three authenticate by exact-matching an `Authorization: Bearer <key>`
header against `SUPABASE_SERVICE_ROLE_KEY`, and all three reject non-POST
requests with a 405 before that check.

> **Key gotcha.** This project is on Supabase's new API key system
> (`sb_publishable_` / `sb_secret_`). On such projects the injected
> `SUPABASE_SERVICE_ROLE_KEY` env var holds the **new secret key**, not the
> legacy `service_role` JWT. Cron headers must carry the `sb_secret_…` value —
> the legacy JWT returns 401 from the function's own check, and because pg_net
> dispatches asynchronously, pg_cron will still report the job as "Succeeded".
> That failure mode has bitten this project twice: it swallowed every drop
> notification for weeks, then stalled the sync-push queue for 8 days. Both
> times the function logs looked clean, because a 401 return is not an
> error-level log event — only `booted` and `shutdown` appear. If a scheduled
> job seems inert, check the Invocations tab for status codes rather than the
> Logs tab.

### 4. Frontend

```sh
cp .env.example .env.local   # fill in URL + anon key (dashboard → Settings → API)
npm install
npm run dev
```

Optional: `VITE_SENTRY_DSN` for a Sentry React project, and
`VITE_ANILIST_CLIENT_ID` (see below) to show the AniList link button.

## Deploying Phase 6 (AniList sync)

Already live on the production project — kept here for reference and for setting
up a second environment. 6a must go first; 6b's queue drain depends on the
encrypted token 6a stores. Full steps are in `docs/BRIEF.md` under "Robin's 6a
deploy steps" and "Robin's 6b deploy steps"; the short version:

**6a — link + import.** Register an AniList API client (AniList → Settings →
Developer). The redirect URL must match the app exactly:
`http://localhost:5173/anilist/callback` for dev, `https://<domain>/anilist/callback`
for prod. AniList allows one redirect URL per client, so use two clients if you
need both. A mismatch here is the usual first-try failure. Then set
`VITE_ANILIST_CLIENT_ID` in the frontend env, and `ANILIST_CLIENT_ID`,
`ANILIST_CLIENT_SECRET`, `ANILIST_TOKEN_KEY` (`openssl rand -base64 32`) as Edge
Function secrets. Deploy `anilist-link`, rebuild the frontend, then smoke test:
link → import → re-import (everything should come back "kept local") → unlink
(library survives).

**6b — push sync.** Run the `20260721120000_phase6b_sync_push.sql` migration,
deploy `sync-push`, schedule it every 5 minutes, rebuild the frontend. Smoke
test: enable the sync toggle on Settings, edit an entry, confirm it lands on
AniList within ~5 min and the "N changes waiting to sync" hint clears.

`ANILIST_TOKEN_KEY` is the AES-GCM key that encrypts stored tokens. Rotating or
losing it invalidates existing links; users just re-link. AniList tokens last
about a year and there is no refresh flow yet.

## Checks

```sh
npm run typecheck      # tsc, strict
npm run build          # typecheck + production build
npm run check:bundle   # §8: fail if anything secret-shaped is in dist/
```

RLS: run `supabase/tests/rls_check.sql` in the SQL Editor — it creates two
throwaway users inside a transaction, verifies user A can never read or
write user B's rows (and that nobody can read AniList tokens), then rolls
back. Run it after every schema change.

## Security model (§8 of the brief)

- Every table has RLS, default deny. `media_cache` and `news_items` are
  public-read, service-write.
- `anilist_connections.access_token` is unreadable from the client even for
  the row owner (column-level grants); only Edge Functions touch it. Tokens are
  AES-GCM encrypted at rest on top of that.
- Account deletion is an Edge Function: verifies the caller's JWT, then
  deletes the auth user — every user table cascades from `auth.users`.
- Sentry gets the anonymous user id only. Never emails, tokens, or request
  bodies.
- PostgREST rejects secret keys sent from a browser. Client-side reads of
  public tables use the publishable/anon key.

## Data notes

- Scores are stored 0–100 internally (`library_entries.score`); the profile's
  `score_format` only changes display.
- Manga chapter drops are approximate by design — AniList has no per-chapter
  feed. The drop-check job diffs chapter counts and emits "Updated"
  notifications, never fake precision.
- Episode runtime comes from AniList's `duration` when cached; entries without
  it fall back to a 24 min/ep estimate in Stats, and the card says which.
- News is aggregation only: headline, excerpt, thumbnail, link. Headlines are
  matched to cached series by longest-substring title match, which is
  deliberately conservative — unmatched items just don't show under "My series".
  ANN's RSS carries no images, so thumbnails fall back to the matched series'
  AniList cover, and the box collapses when there's neither.

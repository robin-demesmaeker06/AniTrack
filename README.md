# AniTrack

Anime & manga tracker: watch/read progress, discovery, airing calendar, drop
notifications. Standalone accounts with optional two-way AniList sync.
Web-first, architected so an Expo/React Native app can later reuse the same
backend and services layer.

**Status: Phase 1 of 7** — scaffold, Supabase schema + RLS, auth, base
layout, theme, profile settings. See `docs/build-plan` in the project brief
for the full phase order.

## Stack

React 19 + TypeScript + Tailwind 4 + TanStack Query + React Router 7, on
Supabase (Auth, Postgres + RLS, Edge Functions). Metadata from the AniList
GraphQL API (Phase 2+). Sentry for error monitoring.

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
2. In the dashboard, open **SQL Editor**, paste the contents of
   `supabase/migrations/20260714120000_init.sql`, run it.
   (Alternative: `supabase init` + `supabase link` + `supabase db push`
   with the CLI.)
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

### 3. Edge Function

```sh
supabase functions deploy delete-account
# optional, for error monitoring:
supabase secrets set SENTRY_DSN=your-edge-dsn
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
The service-role key never leaves Supabase's servers.

### 4. Frontend

```sh
cp .env.example .env.local   # fill in URL + anon key (dashboard → Settings → API)
npm install
npm run dev
```

Optional: create a Sentry project (React) and put its DSN in
`VITE_SENTRY_DSN`.

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
  the row owner (column-level grants); only Edge Functions touch it.
- Account deletion is an Edge Function: verifies the caller's JWT, then
  deletes the auth user — every user table cascades from `auth.users`.
- Sentry gets the anonymous user id only. Never emails, tokens, or request
  bodies.

## Data notes

- Scores are stored 0–100 internally (`library_entries.score`); the profile's
  `score_format` only changes display.
- Manga chapter drops are approximate by design — AniList has no per-chapter
  feed. The Phase 5 job diffs chapter counts and emits "Updated"
  notifications, never fake precision.

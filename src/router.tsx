import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RouteError, FullPageRouteError } from "@/components/layout/RouteError";
import { RequireAuth, RedirectIfAuthed } from "@/features/auth/guards";
import { SignInPage } from "@/features/auth/SignInPage";
import { SignUpPage } from "@/features/auth/SignUpPage";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "@/features/auth/PasswordPages";
import { AuthCallbackPage } from "@/features/auth/AuthCallbackPage";
import { HomePage } from "@/features/home/HomePage";
import { SchedulePage } from "@/features/schedule/SchedulePage";
import { NewsPage } from "@/features/news/NewsPage";
import { ExplorePage } from "@/features/explore/ExplorePage";
import { MediaDetailPage } from "@/features/media/MediaDetailPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { SettingsPage } from "@/features/profile/SettingsPage";
import { AnilistCallbackPage } from "@/features/profile/AnilistCallbackPage";
import { StatsPage } from "@/features/stats/StatsPage";
import { Link } from "react-router";

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <p className="font-display text-3xl font-bold">404</p>
      <p className="text-sm text-ink-soft">That page doesn't exist.</p>
      <Link to="/" className="text-sm text-signal hover:text-signal-strong">
        Go home
      </Link>
    </div>
  );
}

// Pages inside AppShell get the inline error card (nav chrome survives);
// standalone pages get the full-height variant. See RouteError.tsx.
const shellError = { errorElement: <RouteError /> };
const pageError = { errorElement: <FullPageRouteError /> };

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    ...pageError,
    children: [
      { path: "/signin", element: <SignInPage />, ...pageError },
      { path: "/signup", element: <SignUpPage />, ...pageError },
      { path: "/forgot-password", element: <ForgotPasswordPage />, ...pageError },
    ],
  },
  // Reachable regardless of auth state: these carry their own tokens.
  { path: "/auth/callback", element: <AuthCallbackPage />, ...pageError },
  { path: "/reset-password", element: <ResetPasswordPage />, ...pageError },
  { path: "/verify-email", element: <VerifyEmailPage />, ...pageError },
  {
    element: <RequireAuth />,
    ...pageError,
    children: [
      // AniList OAuth redirect target — authed, but no app shell/nav chrome.
      { path: "/anilist/callback", element: <AnilistCallbackPage />, ...pageError },
      {
        element: <AppShell />,
        ...pageError,
        children: [
          { path: "/", element: <HomePage />, ...shellError },
          { path: "/schedule", element: <SchedulePage />, ...shellError },
          { path: "/news", element: <NewsPage />, ...shellError },
          { path: "/explore/:type", element: <ExplorePage />, ...shellError },
          { path: "/media/:type/:id", element: <MediaDetailPage />, ...shellError },
          { path: "/profile", element: <ProfilePage />, ...shellError },
          { path: "/stats", element: <StatsPage />, ...shellError },
          { path: "/settings", element: <SettingsPage />, ...shellError },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

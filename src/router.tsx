import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
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
import { ExplorePage } from "@/features/explore/ExplorePage";
import { MediaDetailPage } from "@/features/media/MediaDetailPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { SettingsPage } from "@/features/profile/SettingsPage";
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

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: "/signin", element: <SignInPage /> },
      { path: "/signup", element: <SignUpPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
  // Reachable regardless of auth state: these carry their own tokens.
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/schedule", element: <SchedulePage /> },
          { path: "/explore/:type", element: <ExplorePage /> },
          { path: "/media/:type/:id", element: <MediaDetailPage /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/stats", element: <StatsPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

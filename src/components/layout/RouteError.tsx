import { useEffect } from "react";
import { Link, useRouteError } from "react-router";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/Button";

/**
 * Route-level error boundary (§Phase 7).
 *
 * Wired as `errorElement` on each page route, so it renders inside AppShell's
 * Outlet: a render throw on one page degrades that page only and leaves the
 * nav chrome usable, instead of blanking the whole app to the Sentry root
 * boundary in main.tsx (which stays as the last resort for throws in the
 * shell, providers or router itself).
 *
 * Reports to Sentry manually — the root Sentry.ErrorBoundary never sees these,
 * because react-router catches them first.
 */
export function RouteError() {
  const error = useRouteError();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-danger/40 px-6 py-12 text-center"
    >
      <p className="font-display text-base font-bold text-ink">
        This page hit an error
      </p>
      <p className="max-w-sm text-sm text-ink-soft">
        The rest of the app still works — use the nav to go somewhere else, or
        try loading this page again.
      </p>
      {detail && (
        <p className="max-w-sm truncate font-mono text-xs text-ink-faint">
          {detail}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Try again
        </Button>
        <Link
          to="/"
          className="rounded-md px-4 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

/**
 * Full-height variant for routes that render outside AppShell (auth pages,
 * OAuth callbacks) — there's no surrounding chrome to fall back to there.
 */
export function FullPageRouteError() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <RouteError />
      </div>
    </div>
  );
}

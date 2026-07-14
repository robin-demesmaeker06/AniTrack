// Shared Sentry wiring for Edge Functions (§2).
// Tags events with the anonymous user id only — never tokens, emails,
// or request bodies.
import * as Sentry from "npm:@sentry/deno@9";

const dsn = Deno.env.get("SENTRY_DSN");
export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    // Errors only; no tracing, no PII.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

export function captureError(err: unknown, userId?: string): void {
  console.error(err);
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (userId) scope.setUser({ id: userId });
    Sentry.captureException(err);
  });
}

export async function flushSentry(): Promise<void> {
  if (sentryEnabled) {
    await Sentry.flush(2000);
  }
}

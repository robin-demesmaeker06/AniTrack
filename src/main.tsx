import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";

import "@fontsource-variable/syne/index.css";
import "@fontsource-variable/manrope/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/index.css";

import { router } from "./router";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ToastProvider } from "./components/ui/Toast";
import { SetupRequired } from "./components/layout/SetupRequired";
import { isSupabaseConfigured } from "./services/supabaseClient";

// Sentry from phase 1 (§2): errors only, anonymous user id only, no PII.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: "4rem 1rem", textAlign: "center" }}>
          <p>Something broke. Reload the page to keep going.</p>
        </div>
      }
    >
      <Root />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

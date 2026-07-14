import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getSession, onAuthStateChange } from "@/services/authService";
import { AuthLayout } from "./AuthLayout";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Target for OAuth redirects and email verification links.
 *
 * supabase-js performs the PKCE code exchange itself on load
 * (detectSessionInUrl) — this page only waits for the session to appear.
 * Exchanging manually here too would race the library and consume the
 * one-time code twice.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(() => {
    // OAuth providers report denials via query params.
    const params = new URLSearchParams(window.location.search);
    return params.get("error_description") ?? params.get("error");
  });

  useEffect(() => {
    if (error) return;
    let settled = false;

    const goHome = () => {
      if (!settled) {
        settled = true;
        navigate("/", { replace: true });
      }
    };

    const unsubscribe = onAuthStateChange((session) => {
      if (session) goHome();
    });
    void getSession().then((session) => {
      if (session) goHome();
    });

    // If no session materializes, the code exchange failed (e.g. the link
    // was opened in a different browser than the signup happened in).
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setError(
          "Couldn't complete sign-in from this link. If you opened it in a different browser than the one you signed up in, your email is likely verified anyway — just sign in with your password.",
        );
      }
    }, 6000);

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate, error]);

  return (
    <AuthLayout title="Signing you in…">
      {error ? (
        <div className="text-sm">
          <p className="text-danger">{error}</p>
          <Link
            to="/signin"
            className="mt-3 inline-block text-signal hover:text-signal-strong"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <div className="flex justify-center py-4 text-signal">
          <Spinner size={24} />
        </div>
      )}
    </AuthLayout>
  );
}

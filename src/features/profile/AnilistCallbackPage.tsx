import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { exchangeAnilistCode } from "@/services/anilistLinkService";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

// An AniList authorization code is single-use, but React StrictMode (dev)
// mounts this page twice — a naive effect would submit the code twice and the
// second submit would 400 on a spent code. Caching the in-flight promise per
// code guarantees exactly one exchange no matter how many times the effect
// runs (the map lives at module scope, so it survives remounts).
const inflight = new Map<
  string,
  Promise<{ anilistUserId: number; name: string | null }>
>();
function exchangeOnce(code: string) {
  let p = inflight.get(code);
  if (!p) {
    p = exchangeAnilistCode(code);
    inflight.set(code, p);
  }
  return p;
}

/** Landing page for AniList's OAuth redirect (§Phase 6a). Reads the ?code,
 * exchanges it exactly once, then routes back to Settings. Sits behind
 * RequireAuth (outside the app shell) so the caller's Supabase session is
 * present for the exchange. */
export function AnilistCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const code = params.get("code");
  const denied = params.get("error");

  useEffect(() => {
    if (denied) {
      setError("AniList authorization was cancelled.");
      return;
    }
    if (!code) {
      setError("No authorization code came back from AniList.");
      return;
    }
    let alive = true;
    exchangeOnce(code)
      .then((r) => {
        if (!alive) return;
        void queryClient.invalidateQueries({ queryKey: ["anilist-connection"] });
        toast(r.name ? `Linked to AniList as ${r.name}.` : "AniList linked.", "success");
        navigate("/settings", { replace: true });
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Linking failed.");
      });
    return () => {
      alive = false;
    };
  }, [code, denied, navigate, toast, queryClient]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <p className="font-display text-xl font-bold">Couldn't link AniList</p>
          <p className="max-w-sm text-sm text-ink-soft">{error}</p>
          <Button onClick={() => navigate("/settings", { replace: true })}>
            Back to settings
          </Button>
        </>
      ) : (
        <>
          <Spinner size={28} />
          <p className="text-sm text-ink-soft">Linking your AniList account…</p>
        </>
      )}
    </div>
  );
}

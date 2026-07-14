import { Logo } from "@/components/ui/Logo";

/** Shown when env vars are missing — a readable setup screen, not a crash. */
export function SetupRequired() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size="text-2xl" />
      <h1 className="font-display text-lg font-bold">Almost there</h1>
      <p className="max-w-md text-sm text-ink-soft">
        Supabase isn't configured yet. Copy{" "}
        <code className="numeric rounded bg-raised px-1.5 py-0.5 text-xs">.env.example</code>{" "}
        to{" "}
        <code className="numeric rounded bg-raised px-1.5 py-0.5 text-xs">.env.local</code>
        , fill in your project URL and anon key, and restart the dev server.
        Full steps are in the README.
      </p>
    </div>
  );
}

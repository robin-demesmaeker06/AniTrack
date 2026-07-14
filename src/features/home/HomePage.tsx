import { Link } from "react-router";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProfile } from "@/features/profile/useProfile";

export function HomePage() {
  const { data: profile } = useProfile();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-2xl font-bold">
          {profile ? `Hey, ${profile.username}` : "Home"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Continue watching, new drops, and your activity land here.
        </p>
      </header>

      <section aria-labelledby="continue-heading">
        <h2 id="continue-heading" className="mb-3 font-display text-base font-bold">
          Continue watching
        </h2>
        <EmptyState
          title="Your library is empty"
          body="Add anime or manga and your in-progress series show up here with one-tap progress."
          action={
            <Link
              to="/explore/anime"
              className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-on-signal hover:bg-signal-strong"
            >
              Explore anime →
            </Link>
          }
        />
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-3 font-display text-base font-bold">
          Recent activity
        </h2>
        <EmptyState
          title="No activity yet"
          body="Progress updates, scores, and status changes appear here as you track."
        />
      </section>
    </div>
  );
}

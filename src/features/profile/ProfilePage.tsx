import { Link, useNavigate } from "react-router";
import { useProfile } from "./useProfile";
import { signOut } from "@/services/authService";
import { formatMemberSince } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

export function ProfilePage() {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-signal">
        <Spinner size={24} />
      </div>
    );
  }
  if (!profile) return null;

  async function onSignOut() {
    await signOut();
    navigate("/signin", { replace: true });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        <Avatar username={profile.username} avatarUrl={profile.avatarUrl} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold">
            {profile.username}
          </h1>
          <p className="text-sm text-ink-soft">
            Member since {formatMemberSince(profile.createdAt)}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            AniList: not linked · arrives in Phase 6
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Link
            to="/settings"
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-signal/60 hover:text-ink"
          >
            Settings
          </Link>
          <button
            onClick={() => void onSignOut()}
            className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-danger/60 hover:text-danger"
          >
            Sign out
          </button>
        </div>
      </header>

      <section aria-labelledby="library-heading">
        <h2 id="library-heading" className="mb-3 font-display text-base font-bold">
          Library
        </h2>
        <EmptyState
          title="Nothing tracked yet"
          body="Your anime and manga lists, stats, and genre breakdown appear here from Phase 3."
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
    </div>
  );
}

function Avatar({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-16 rounded-full border border-line-strong object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex size-16 items-center justify-center rounded-full bg-raised font-display text-xl font-bold text-signal"
    >
      {username.slice(0, 1).toUpperCase()}
    </div>
  );
}

import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import { useProfile } from "@/features/profile/useProfile";
import { useLibraryList } from "@/features/library/useLibrary";
import { getRecentActivity, type ActivityWithMedia } from "@/services/activityService";
import { computeDrops, type Drop } from "./drops";
import { ContinueCard } from "./ContinueCard";
import { LibraryNewsStrip } from "@/features/news/LibraryNewsStrip";
import { displayTitle, formatScore, timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import type { TitleLanguage } from "@/types";

export function HomePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const listQuery = useLibraryList();
  const language = profile?.titleLanguage ?? "ENGLISH";

  const activityQuery = useQuery({
    queryKey: ["activity", user?.id],
    queryFn: () => getRecentActivity(user!.id),
    enabled: Boolean(user),
    staleTime: 30 * 1000,
  });

  const items = listQuery.data ?? [];

  const inProgress = useMemo(
    () =>
      items
        .filter((i) => i.entry.status === "CURRENT" || i.entry.status === "REPEATING")
        .sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt)),
    [items],
  );

  const drops = useMemo(() => computeDrops(items), [items]);
  const libraryIds = useMemo(
    () => items.map((i) => i.entry.anilistMediaId),
    [items],
  );
  const libraryEmpty = !listQuery.isLoading && items.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-2xl font-bold">
          {profile ? `Hey, ${profile.username}` : "Home"}
        </h1>
      </header>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-12 text-signal">
          <Spinner size={24} />
        </div>
      ) : libraryEmpty ? (
        <EmptyState
          title="Your library is empty"
          body="Track something and Home fills up: continue watching, new drops, your activity."
          action={
            <Link
              to="/explore/anime"
              className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-on-signal hover:bg-signal-strong"
            >
              Explore anime →
            </Link>
          }
        />
      ) : (
        <>
          <section aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="mb-3 font-display text-base font-bold">
              Continue {inProgress.some((i) => i.entry.mediaType === "MANGA") ? "watching & reading" : "watching"}
            </h2>
            {inProgress.length === 0 ? (
              <EmptyState
                title="Nothing in progress"
                body='Set a series to "Watching" or "Reading" and it lands here with one-tap progress.'
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {inProgress.map((item) => (
                  <ContinueCard key={item.entry.id} item={item} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="drops-heading">
            <h2 id="drops-heading" className="mb-3 font-display text-base font-bold">
              New drops for you
            </h2>
            {drops.length === 0 ? (
              <p className="text-sm text-ink-faint">
                All caught up — nothing new on your airing series.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {drops.map((drop) => (
                  <DropRow key={drop.item.entry.id} drop={drop} language={language} />
                ))}
              </div>
            )}
          </section>

          <LibraryNewsStrip anilistMediaIds={libraryIds} />
        </>
      )}

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-3 font-display text-base font-bold">
          Recent activity
        </h2>
        {activityQuery.isLoading ? (
          <div className="flex justify-center py-6 text-signal">
            <Spinner />
          </div>
        ) : (activityQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Progress updates, scores, and status changes appear here as you track."
          />
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {(activityQuery.data ?? []).map((entry) => (
              <ActivityRow key={entry.activity.id} entry={entry} language={language} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DropRow({ drop, language }: { drop: Drop; language: TitleLanguage }) {
  const { entry, media } = drop.item;
  const href = `/media/${entry.mediaType.toLowerCase()}/${entry.anilistMediaId}`;
  const title = media ? displayTitle(media.titles, language) : `#${entry.anilistMediaId}`;

  return (
    <Link
      to={href}
      className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 transition-colors hover:border-signal/50"
    >
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-raised">
        {media?.coverUrl && (
          <img src={media.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-medium text-ink group-hover:text-signal-strong">
          {title}
        </p>
        <p className="numeric text-xs text-ink-soft">
          You're at {entry.progress > 0 ? entry.progress : "the start"}
        </p>
      </div>
      <span
        className={`numeric shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${
          drop.isApproximate
            ? "bg-raised text-warn"
            : "bg-signal/15 text-signal-strong"
        }`}
      >
        {drop.isApproximate
          ? `Updated · ch ${drop.latest}`
          : drop.newEpisodes === 1
            ? `Ep ${drop.latest} aired`
            : `+${drop.newEpisodes} episodes`}
      </span>
    </Link>
  );
}

function ActivityRow({
  entry,
  language,
}: {
  entry: ActivityWithMedia;
  language: TitleLanguage;
}) {
  const { data: profile } = useProfile();
  const { activity, media } = entry;
  const title = media
    ? displayTitle(media.titles, language)
    : `#${activity.anilistMediaId}`;
  const href = `/media/${activity.mediaType.toLowerCase()}/${activity.anilistMediaId}`;
  const unit = activity.mediaType === "ANIME" ? "ep" : "ch";

  let text: string;
  switch (activity.action) {
    case "added":
      text = `Added · ${String(activity.detail.status ?? "").toLowerCase() || "library"}`;
      break;
    case "progress": {
      const progress = activity.detail.progress;
      const total = activity.detail.total;
      text = `${unit} ${progress}${total ? ` / ${total}` : ""}`;
      break;
    }
    case "status_change":
      text = `${String(activity.detail.from ?? "").toLowerCase()} → ${String(activity.detail.to ?? "").toLowerCase()}`;
      break;
    case "score": {
      const score = activity.detail.score;
      text =
        typeof score === "number"
          ? `Scored ${formatScore(score, profile?.scoreFormat ?? "POINT_10_DECIMAL")}`
          : "Score cleared";
      break;
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Link to={href} className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm text-ink hover:text-signal-strong">{title}</p>
      </Link>
      <span className="numeric shrink-0 text-xs text-ink-soft">{text}</span>
      <span className="shrink-0 text-xs text-ink-faint">{timeAgo(activity.createdAt)}</span>
    </div>
  );
}

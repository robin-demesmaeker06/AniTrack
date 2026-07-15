import { Link } from "react-router";
import type { EntryStatus, Media } from "@/types";
import { displayTitle } from "@/lib/format";
import { useProfile } from "@/features/profile/useProfile";

const statusLabels: Record<EntryStatus, string> = {
  CURRENT: "Watching",
  COMPLETED: "Completed",
  PLANNING: "Planning",
  PAUSED: "Paused",
  DROPPED: "Dropped",
  REPEATING: "Rewatching",
};

const formatLabels: Record<string, string> = {
  TV: "TV",
  MOVIE: "Movie",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Special",
  MANGA: "Manga",
  NOVEL: "Novel",
  ONE_SHOT: "One-shot",
};

export function MediaCard({
  media,
  libraryStatus,
}: {
  media: Media;
  libraryStatus: EntryStatus | null;
}) {
  const { data: profile } = useProfile();
  const title = displayTitle(media.titles, profile?.titleLanguage ?? "ENGLISH");
  const href = `/media/${media.mediaType.toLowerCase()}/${media.anilistMediaId}`;

  return (
    <Link
      to={href}
      className="group relative flex flex-col overflow-hidden rounded-card bg-surface transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-raised">
        {media.coverUrl && (
          <img
            src={media.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover:opacity-90"
          />
        )}
        {media.averageScore != null && (
          <span className="numeric absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-signal-strong">
            {media.averageScore}%
          </span>
        )}
        {libraryStatus && (
          <span className="absolute left-1.5 top-1.5 rounded bg-signal px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-signal">
            {statusLabels[libraryStatus]}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink group-hover:text-signal-strong">
          {title}
        </p>
        <p className="text-[11px] text-ink-faint">
          {[formatLabels[media.format ?? ""] ?? media.format, media.seasonYear]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-card bg-surface">
      <div className="aspect-[2/3] bg-raised" />
      <div className="flex flex-col gap-1.5 p-2">
        <div className="h-3.5 w-4/5 rounded bg-raised" />
        <div className="h-3 w-2/5 rounded bg-raised" />
      </div>
    </div>
  );
}

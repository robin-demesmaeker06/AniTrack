import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getMediaDetail } from "@/services/anilistService";
import { useProfile } from "@/features/profile/useProfile";
import { useLibraryLookup } from "@/features/library/useLibraryLookup";
import { TrackingWidget } from "@/features/library/TrackingWidget";
import { useCountdown } from "./useCountdown";
import { displayTitle } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { Media, MediaDetail, MediaType, TitleLanguage } from "@/types";

const relationLabels: Record<string, string> = {
  PREQUEL: "Prequel",
  SEQUEL: "Sequel",
  PARENT: "Parent story",
  SIDE_STORY: "Side story",
  ADAPTATION: "Adaptation",
  SOURCE: "Source",
  ALTERNATIVE: "Alternative",
  SPIN_OFF: "Spin-off",
  OTHER: "Related",
  CHARACTER: "Shares characters",
  SUMMARY: "Summary",
  COMPILATION: "Compilation",
  CONTAINS: "Contains",
};

export function MediaDetailPage() {
  const { type, id } = useParams();
  const mediaType: MediaType = type === "manga" ? "MANGA" : "ANIME";
  const mediaId = Number(id);
  const { data: profile } = useProfile();
  const { statusFor } = useLibraryLookup();
  const language = profile?.titleLanguage ?? "ENGLISH";

  const query = useQuery({
    queryKey: ["media-detail", mediaType, mediaId],
    queryFn: () => getMediaDetail(mediaType, mediaId),
    enabled: Number.isInteger(mediaId) && mediaId > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (query.isError) {
    return (
      <EmptyState
        title="Couldn't load this title"
        body={query.error instanceof Error ? query.error.message : undefined}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (query.isLoading || !query.data) return <DetailSkeleton />;

  const media = query.data;
  const title = displayTitle(media.titles, language);
  const inLibrary = statusFor(mediaType, mediaId);

  return (
    <article className="-mx-4 flex flex-col md:-mx-8">
      {/* Banner */}
      <div className="relative h-40 overflow-hidden bg-raised md:h-56">
        {media.bannerUrl ? (
          <img src={media.bannerUrl} alt="" className="size-full object-cover" />
        ) : media.coverUrl ? (
          <img
            src={media.coverUrl}
            alt=""
            className="size-full scale-110 object-cover opacity-40 blur-xl"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
      </div>

      <div className="px-4 md:px-8">
        {/* Header row */}
        <div className="-mt-16 flex gap-4 md:-mt-20 md:gap-6">
          <img
            src={media.coverUrl ?? undefined}
            alt=""
            className="z-10 aspect-[2/3] w-28 shrink-0 rounded-card border border-line-strong object-cover shadow-xl md:w-40"
          />
          <div className="mt-16 min-w-0 md:mt-20">
            <h1 className="font-display text-xl font-bold leading-tight md:text-3xl">
              {title}
            </h1>
            <MetaLine media={media} />
            {inLibrary && (
              <span className="mt-2 inline-block rounded bg-signal px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-on-signal">
                In your library
              </span>
            )}
          </div>
        </div>

        <AiringBanner media={media} />

        {/* Facts */}
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {media.averageScore != null && (
            <Fact label="Score" value={`${media.averageScore}%`} numeric />
          )}
          {media.episodes != null && (
            <Fact label="Episodes" value={String(media.episodes)} numeric />
          )}
          {media.chapters != null && (
            <Fact label="Chapters" value={String(media.chapters)} numeric />
          )}
          {media.volumes != null && (
            <Fact label="Volumes" value={String(media.volumes)} numeric />
          )}
          {media.season && media.seasonYear && (
            <Fact
              label="Season"
              value={`${media.season[0]}${media.season.slice(1).toLowerCase()} ${media.seasonYear}`}
            />
          )}
          {media.studios.length > 0 && (
            <Fact label="Studio" value={media.studios.join(", ")} />
          )}
        </dl>

        {/* Genres */}
        {media.genres.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {media.genres.map((genre) => (
              <Link
                key={genre}
                to={`/explore/${mediaType.toLowerCase()}?genres=${encodeURIComponent(genre)}`}
                className="rounded-full bg-raised px-2.5 py-1 text-xs text-ink-soft transition-colors hover:text-signal"
              >
                {genre}
              </Link>
            ))}
          </div>
        )}

        {/* Description — sanitized before render (§3) */}
        {media.descriptionHtml && (
          <div
            className="mt-5 max-w-3xl text-sm leading-relaxed text-ink-soft [&_a]:text-signal [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(media.descriptionHtml) }}
          />
        )}

        <TrackingWidget media={media} />

        {media.relations.length > 0 && (
          <Rail title="Relations">
            {media.relations.map((rel) => (
              <RailCard
                key={`${rel.media.mediaType}:${rel.media.anilistMediaId}:${rel.relationType}`}
                media={rel.media}
                language={language}
                caption={relationLabels[rel.relationType] ?? rel.relationType}
              />
            ))}
          </Rail>
        )}

        {media.recommendations.length > 0 && (
          <Rail title="You might also like">
            {media.recommendations.map((rec) => (
              <RailCard
                key={`${rec.mediaType}:${rec.anilistMediaId}`}
                media={rec}
                language={language}
                caption={rec.averageScore != null ? `${rec.averageScore}%` : undefined}
              />
            ))}
          </Rail>
        )}

        <div className="h-8" />
      </div>
    </article>
  );
}

function MetaLine({ media }: { media: MediaDetail }) {
  const parts = [
    media.format?.replaceAll("_", " "),
    media.airingStatus === "RELEASING"
      ? media.mediaType === "ANIME" ? "Airing" : "Releasing"
      : media.airingStatus === "NOT_YET_RELEASED"
        ? "Upcoming"
        : media.airingStatus === "FINISHED"
          ? "Finished"
          : media.airingStatus?.toLowerCase(),
  ].filter(Boolean);
  return <p className="mt-1 text-sm text-ink-soft">{parts.join(" · ")}</p>;
}

function AiringBanner({ media }: { media: MediaDetail }) {
  const countdown = useCountdown(media.nextAiringAt);
  if (!countdown || media.nextAiringEpisode == null) return null;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-signal/30 bg-signal/5 px-4 py-2.5">
      <span className="size-2 animate-pulse rounded-full bg-signal" aria-hidden="true" />
      <p className="text-sm text-ink">
        <span className="numeric font-medium text-signal-strong">
          Ep {media.nextAiringEpisode}
        </span>{" "}
        airs in <span className="numeric">{countdown}</span>
      </p>
    </div>
  );
}

function Fact({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 text-ink ${numeric ? "numeric" : ""}`}>{value}</dd>
    </div>
  );
}

function Rail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-base font-bold">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}

function RailCard({
  media,
  language,
  caption,
}: {
  media: Media;
  language: TitleLanguage;
  caption?: string;
}) {
  return (
    <Link
      to={`/media/${media.mediaType.toLowerCase()}/${media.anilistMediaId}`}
      className="group w-24 shrink-0 md:w-28"
    >
      <div className="aspect-[2/3] overflow-hidden rounded-card bg-raised">
        {media.coverUrl && (
          <img
            src={media.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover:opacity-85"
          />
        )}
      </div>
      {caption && (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-signal">{caption}</p>
      )}
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-soft group-hover:text-ink">
        {displayTitle(media.titles, language)}
      </p>
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="-mx-4 animate-pulse md:-mx-8">
      <div className="h-40 bg-raised md:h-56" />
      <div className="px-4 md:px-8">
        <div className="-mt-16 flex gap-4 md:-mt-20 md:gap-6">
          <div className="aspect-[2/3] w-28 rounded-card bg-raised md:w-40" />
          <div className="mt-20 flex flex-col gap-2">
            <div className="h-6 w-64 max-w-[50vw] rounded bg-raised" />
            <div className="h-4 w-32 rounded bg-raised" />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <div className="h-3.5 w-full max-w-2xl rounded bg-raised" />
          <div className="h-3.5 w-5/6 max-w-2xl rounded bg-raised" />
          <div className="h-3.5 w-4/6 max-w-2xl rounded bg-raised" />
        </div>
      </div>
    </div>
  );
}

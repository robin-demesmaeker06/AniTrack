import { useEffect, useMemo, useRef } from "react";
import { NavLink, useParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { browseMedia } from "@/services/anilistService";
import { useExploreParams } from "./useExploreParams";
import { useLibraryLookup } from "@/features/library/useLibraryLookup";
import { FilterBar } from "./FilterBar";
import { MediaCard, MediaCardSkeleton } from "./MediaCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { MediaType } from "@/types";

/** One shared component, two routes: /explore/anime and /explore/manga (§6.3). */
export function ExplorePage() {
  const { type } = useParams();
  const mediaType: MediaType = type === "manga" ? "MANGA" : "ANIME";
  const { filters, update, clear, activeCount } = useExploreParams();
  const { statusFor } = useLibraryLookup();

  const query = useInfiniteQuery({
    queryKey: ["explore", mediaType, filters],
    queryFn: ({ pageParam }) => browseMedia(mediaType, filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? last.pageInfo.currentPage + 1 : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const media = useMemo(
    () => query.data?.pages.flatMap((p) => p.media) ?? [],
    [query.data],
  );

  // Infinite scroll: load more when the sentinel becomes visible.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, media.length]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Explore</h1>
        <div className="flex rounded-md border border-line p-0.5 text-sm">
          <TypeTab to={`/explore/anime${location.search}`} label="Anime" active={mediaType === "ANIME"} />
          <TypeTab to={`/explore/manga${location.search}`} label="Manga" active={mediaType === "MANGA"} />
        </div>
      </header>

      <FilterBar
        type={mediaType}
        filters={filters}
        activeCount={activeCount}
        onChange={update}
        onClear={clear}
      />

      {query.isError ? (
        <EmptyState
          title="Couldn't load results"
          body={query.error instanceof Error ? query.error.message : "AniList didn't answer."}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : query.isLoading ? (
        <Grid>
          {Array.from({ length: 12 }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </Grid>
      ) : media.length === 0 ? (
        <EmptyState
          title="No results"
          body="Loosen a filter or try a different search."
          action={
            activeCount > 0 ? (
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Grid>
            {media.map((m) => (
              <MediaCard
                key={`${m.mediaType}:${m.anilistMediaId}`}
                media={m}
                libraryStatus={statusFor(m.mediaType, m.anilistMediaId)}
              />
            ))}
          </Grid>
          <div ref={sentinelRef} className="flex justify-center py-6 text-signal">
            {isFetchingNextPage ? (
              <Spinner size={22} />
            ) : hasNextPage ? null : (
              <p className="text-xs text-ink-faint">That's everything.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {children}
    </div>
  );
}

function TypeTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={`rounded px-3 py-1 transition-colors ${
        active
          ? "bg-signal text-on-signal font-semibold"
          : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </NavLink>
  );
}

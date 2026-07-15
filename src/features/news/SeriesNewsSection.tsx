import { useSeriesNews } from "./useNews";
import { NewsCard } from "./NewsPage";
import { Spinner } from "@/components/ui/Spinner";
import type { MediaType } from "@/types";

/** News tab/section on the media detail page (§6.7) — Jikan per-series news,
 * lazy-fetched on open (react-query only queries once malId is known and
 * this component is mounted, i.e. the page is actually open). */
export function SeriesNewsSection({
  malId,
  mediaType,
  anilistMediaId,
}: {
  malId: number | null;
  mediaType: MediaType;
  anilistMediaId: number;
}) {
  const query = useSeriesNews(malId, mediaType, anilistMediaId);

  if (malId == null) return null;
  if (query.isLoading) {
    return (
      <section className="mt-8">
        <h2 className="mb-3 font-display text-base font-bold">News</h2>
        <div className="flex justify-center py-6 text-signal">
          <Spinner />
        </div>
      </section>
    );
  }
  if (query.isError || (query.data ?? []).length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-base font-bold">News</h2>
      <div className="flex flex-col gap-2">
        {(query.data ?? []).map((item) => (
          <NewsCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import { getNews, getNewsForMedia, getSeriesNews } from "@/services/newsService";
import type { MediaType } from "@/types";

export function useNews() {
  return useQuery({
    queryKey: ["news"],
    queryFn: () => getNews(),
    staleTime: 15 * 60 * 1000,
  });
}

export function useNewsForLibrary(anilistMediaIds: number[]) {
  const key = [...anilistMediaIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["news-for-library", key],
    queryFn: () => getNewsForMedia(anilistMediaIds),
    enabled: anilistMediaIds.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

export function useSeriesNews(
  malId: number | null,
  mediaType: MediaType,
  anilistMediaId: number,
) {
  return useQuery({
    queryKey: ["series-news", mediaType, malId],
    queryFn: () => getSeriesNews(malId!, mediaType, anilistMediaId),
    enabled: malId != null,
    // The series-news function owns the real (12–24h) cache window; this
    // just avoids refetching every time the component remounts in-session.
    staleTime: 60 * 60 * 1000,
  });
}

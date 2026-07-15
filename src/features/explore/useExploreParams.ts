import { useSearchParams } from "react-router";
import type { AiringStatus, ExploreFilters, ExploreSort, MediaSeason } from "@/types";

const SORTS: ExploreSort[] = [
  "TRENDING_DESC",
  "POPULARITY_DESC",
  "SCORE_DESC",
  "START_DATE_DESC",
];
const SEASONS: MediaSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const STATUSES: AiringStatus[] = [
  "RELEASING",
  "FINISHED",
  "NOT_YET_RELEASED",
  "CANCELLED",
  "HIATUS",
];

/**
 * All filter state lives in the URL (§6.3): views are shareable and the
 * back button works. This hook is the single translator between
 * URLSearchParams and typed ExploreFilters.
 */
export function useExploreParams() {
  const [params, setParams] = useSearchParams();

  const filters: ExploreFilters = {
    search: params.get("q") ?? undefined,
    genres: params.get("genres")?.split(",").filter(Boolean) ?? [],
    year: parseYear(params.get("year")),
    season: pick(params.get("season"), SEASONS),
    formats: params.get("formats")?.split(",").filter(Boolean) ?? [],
    status: pick(params.get("status"), STATUSES),
    sort: pick(params.get("sort"), SORTS) ?? "TRENDING_DESC",
  };

  function update(change: Partial<ExploreFilters>) {
    const next = { ...filters, ...change };
    const p = new URLSearchParams();
    if (next.search) p.set("q", next.search);
    if (next.genres.length) p.set("genres", next.genres.join(","));
    if (next.year) p.set("year", String(next.year));
    if (next.season) p.set("season", next.season);
    if (next.formats.length) p.set("formats", next.formats.join(","));
    if (next.status) p.set("status", next.status);
    if (next.sort !== "TRENDING_DESC") p.set("sort", next.sort);
    setParams(p, { replace: true });
  }

  function clear() {
    setParams(new URLSearchParams(), { replace: true });
  }

  const activeCount =
    filters.genres.length +
    filters.formats.length +
    (filters.year ? 1 : 0) +
    (filters.season ? 1 : 0) +
    (filters.status ? 1 : 0);

  return { filters, update, clear, activeCount };
}

function parseYear(value: string | null): number | undefined {
  if (!value) return undefined;
  const year = Number(value);
  return Number.isInteger(year) && year >= 1940 && year <= 2030
    ? year
    : undefined;
}

function pick<T extends string>(value: string | null, allowed: T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

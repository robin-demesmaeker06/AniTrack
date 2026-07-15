import type { ExploreSort, MediaSeason } from "@/types";

// AniList's genre list is stable; hardcoding saves an API call (§3 budget).
export const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
] as const;

export const ANIME_FORMATS: Array<{ value: string; label: string }> = [
  { value: "TV", label: "TV" },
  { value: "MOVIE", label: "Movie" },
  { value: "OVA", label: "OVA" },
  { value: "ONA", label: "ONA" },
  { value: "SPECIAL", label: "Special" },
];

export const MANGA_FORMATS: Array<{ value: string; label: string }> = [
  { value: "MANGA", label: "Manga" },
  { value: "NOVEL", label: "Novel" },
  { value: "ONE_SHOT", label: "One-shot" },
];

export const SEASONS: Array<{ value: MediaSeason; label: string }> = [
  { value: "WINTER", label: "Winter" },
  { value: "SPRING", label: "Spring" },
  { value: "SUMMER", label: "Summer" },
  { value: "FALL", label: "Fall" },
];

export const STATUSES: Array<{ value: string; label: string }> = [
  { value: "RELEASING", label: "Airing / releasing" },
  { value: "FINISHED", label: "Finished" },
  { value: "NOT_YET_RELEASED", label: "Upcoming" },
  { value: "HIATUS", label: "On hiatus" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const SORTS: Array<{ value: ExploreSort; label: string }> = [
  { value: "TRENDING_DESC", label: "Trending" },
  { value: "POPULARITY_DESC", label: "Popularity" },
  { value: "SCORE_DESC", label: "Score" },
  { value: "START_DATE_DESC", label: "Newest" },
];

const CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from(
  { length: CURRENT_YEAR + 2 - 1960 },
  (_, i) => CURRENT_YEAR + 1 - i,
);

import { useEffect, useRef, useState } from "react";
import type { ExploreFilters, MediaType } from "@/types";
import {
  ANIME_FORMATS,
  GENRES,
  MANGA_FORMATS,
  SEASONS,
  SORTS,
  STATUSES,
  YEARS,
} from "./constants";

interface FilterBarProps {
  type: MediaType;
  filters: ExploreFilters;
  activeCount: number;
  onChange: (change: Partial<ExploreFilters>) => void;
  onClear: () => void;
}

const selectClass =
  "rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-signal focus:outline-none";

export function FilterBar({
  type,
  filters,
  activeCount,
  onChange,
  onClear,
}: FilterBarProps) {
  const [open, setOpen] = useState(activeCount > 0);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const debounce = useRef<number>(undefined);

  // Keep the input in sync when the URL changes from outside (back button).
  useEffect(() => {
    setSearchDraft(filters.search ?? "");
  }, [filters.search]);

  function onSearchInput(value: string) {
    setSearchDraft(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      onChange({ search: value.trim() || undefined });
    }, 400);
  }

  const formats = type === "ANIME" ? ANIME_FORMATS : MANGA_FORMATS;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="search"
          placeholder={`Search ${type === "ANIME" ? "anime" : "manga"}…`}
          value={searchDraft}
          onChange={(e) => onSearchInput(e.target.value)}
          aria-label="Search"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none"
        />
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as ExploreFilters["sort"] })}
          aria-label="Sort"
          className={selectClass}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors ${
            activeCount > 0
              ? "border-signal text-signal"
              : "border-line text-ink-soft hover:text-ink"
          }`}
        >
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((genre) => {
              const active = filters.genres.includes(genre);
              return (
                <button
                  key={genre}
                  aria-pressed={active}
                  onClick={() =>
                    onChange({
                      genres: active
                        ? filters.genres.filter((g) => g !== genre)
                        : [...filters.genres, genre],
                    })
                  }
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "bg-signal font-semibold text-on-signal"
                      : "bg-raised text-ink-soft hover:text-ink"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.year ?? ""}
              onChange={(e) =>
                onChange({ year: e.target.value ? Number(e.target.value) : undefined })
              }
              aria-label="Year"
              className={selectClass}
            >
              <option value="">Any year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            {type === "ANIME" && (
              <select
                value={filters.season ?? ""}
                onChange={(e) =>
                  onChange({
                    season: (e.target.value || undefined) as ExploreFilters["season"],
                  })
                }
                aria-label="Season"
                className={selectClass}
              >
                <option value="">Any season</option>
                {SEASONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filters.formats[0] ?? ""}
              onChange={(e) =>
                onChange({ formats: e.target.value ? [e.target.value] : [] })
              }
              aria-label="Format"
              className={selectClass}
            >
              <option value="">Any format</option>
              {formats.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={filters.status ?? ""}
              onChange={(e) =>
                onChange({
                  status: (e.target.value || undefined) as ExploreFilters["status"],
                })
              }
              aria-label="Status"
              className={selectClass}
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {activeCount > 0 && (
              <button
                onClick={onClear}
                className="ml-auto text-sm text-ink-soft hover:text-danger"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

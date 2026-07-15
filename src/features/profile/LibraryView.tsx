import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useLibraryList, useListEntryUpdate } from "@/features/library/useLibrary";
import { useProfile } from "./useProfile";
import { ScoreInput } from "@/features/library/ScoreInput";
import { statusLabel, ALL_STATUSES } from "@/lib/statusLabels";
import { displayTitle } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { EntryStatus, MediaType } from "@/types";
import type { LibraryListItem } from "@/services/libraryService";

type SortKey = "updated" | "title" | "score" | "progress";
type ViewMode = "grid" | "list";

/** Profile library (§6.5): status tabs, type switch, grid/list, inline edits. */
export function LibraryView() {
  const { data: profile } = useProfile();
  const listQuery = useLibraryList();
  const [mediaType, setMediaType] = useState<MediaType>("ANIME");
  const [status, setStatus] = useState<EntryStatus | "ALL">("ALL");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const language = profile?.titleLanguage ?? "ENGLISH";

  const items = useMemo(
    () => (listQuery.data ?? []).filter((i) => i.entry.mediaType === mediaType),
    [listQuery.data, mediaType],
  );

  const counts = useMemo(() => {
    const map = new Map<EntryStatus, number>();
    for (const item of items) {
      map.set(item.entry.status, (map.get(item.entry.status) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const visible = useMemo(() => {
    const filtered =
      status === "ALL" ? items : items.filter((i) => i.entry.status === status);
    const titleOf = (i: LibraryListItem) =>
      i.media ? displayTitle(i.media.titles, language) : "";
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "title":
          return titleOf(a).localeCompare(titleOf(b));
        case "score":
          return (b.entry.score ?? -1) - (a.entry.score ?? -1);
        case "progress":
          return b.entry.progress - a.entry.progress;
        default:
          return b.entry.updatedAt.localeCompare(a.entry.updatedAt);
      }
    });
  }, [items, status, sort, language]);

  if (listQuery.isLoading) {
    return (
      <div className="flex justify-center py-10 text-signal">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Type switch + view + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-line p-0.5 text-sm">
          {(["ANIME", "MANGA"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setMediaType(t);
                setStatus("ALL");
              }}
              className={`rounded px-3 py-1 transition-colors ${
                mediaType === t
                  ? "bg-signal font-semibold text-on-signal"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t === "ANIME" ? "Anime" : "Manga"}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort library"
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-signal focus:outline-none"
        >
          <option value="updated">Last updated</option>
          <option value="title">Title</option>
          <option value="score">Score</option>
          <option value="progress">Progress</option>
        </select>
        <div className="ml-auto flex rounded-md border border-line p-0.5 text-sm">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded px-2.5 py-1 capitalize transition-colors ${
                view === v
                  ? "bg-raised font-medium text-ink"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <StatusTab
          label={`All · ${items.length}`}
          active={status === "ALL"}
          onClick={() => setStatus("ALL")}
        />
        {ALL_STATUSES.map((s) => (
          <StatusTab
            key={s}
            label={`${statusLabel(s, mediaType)} · ${counts.get(s) ?? 0}`}
            active={status === s}
            onClick={() => setStatus(s)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? `No ${mediaType === "ANIME" ? "anime" : "manga"} yet` : "Nothing with this status"}
          body={
            items.length === 0
              ? "Find something to track and it shows up here."
              : undefined
          }
          action={
            items.length === 0 ? (
              <Link
                to={`/explore/${mediaType.toLowerCase()}`}
                className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-on-signal hover:bg-signal-strong"
              >
                Explore {mediaType === "ANIME" ? "anime" : "manga"} →
              </Link>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {visible.map((item) => (
            <GridCard key={item.entry.id} item={item} language={language} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {visible.map((item) => (
            <ListRow key={item.entry.id} item={item} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
        active
          ? "bg-signal font-semibold text-on-signal"
          : "bg-raised text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function totalFor(item: LibraryListItem): number | null {
  if (!item.media) return null;
  return item.entry.mediaType === "ANIME"
    ? item.media.episodes
    : item.media.chapters;
}

function href(item: LibraryListItem): string {
  return `/media/${item.entry.mediaType.toLowerCase()}/${item.entry.anilistMediaId}`;
}

function GridCard({
  item,
  language,
}: {
  item: LibraryListItem;
  language: Parameters<typeof displayTitle>[1];
}) {
  const total = totalFor(item);
  const pct = total ? Math.min(100, (item.entry.progress / total) * 100) : 0;
  return (
    <Link to={href(item)} className="group flex flex-col overflow-hidden rounded-card bg-surface">
      <div className="relative aspect-[2/3] overflow-hidden bg-raised">
        {item.media?.coverUrl && (
          <img
            src={item.media.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-opacity group-hover:opacity-90"
          />
        )}
        {total != null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink group-hover:text-signal-strong">
          {item.media ? displayTitle(item.media.titles, language) : `#${item.entry.anilistMediaId}`}
        </p>
        <p className="numeric mt-0.5 text-[11px] text-ink-faint">
          {item.entry.progress}
          {total != null ? ` / ${total}` : ""}
        </p>
      </div>
    </Link>
  );
}

function ListRow({
  item,
  language,
}: {
  item: LibraryListItem;
  language: Parameters<typeof displayTitle>[1];
}) {
  const { data: profile } = useProfile();
  const updateMutation = useListEntryUpdate();
  const toast = useToast();
  const total = totalFor(item);
  const atMax = total != null && item.entry.progress >= total;

  function change(changes: Parameters<typeof updateMutation.mutate>[0]["changes"]) {
    updateMutation.mutate(
      { current: item.entry, changes, total },
      { onError: () => toast("Change didn't save — try again.", "error") },
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Link to={href(item)} className="shrink-0">
        <div className="h-14 w-10 overflow-hidden rounded bg-raised">
          {item.media?.coverUrl && (
            <img src={item.media.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
          )}
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={href(item)} className="line-clamp-1 text-sm font-medium text-ink hover:text-signal-strong">
          {item.media ? displayTitle(item.media.titles, language) : `#${item.entry.anilistMediaId}`}
        </Link>
        <p className="text-xs text-ink-faint">
          {statusLabel(item.entry.status, item.entry.mediaType)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="numeric text-xs text-ink-soft">
          {item.entry.progress}
          {total != null ? ` / ${total}` : ""}
        </span>
        <button
          onClick={() => change({ progress: item.entry.progress + 1 })}
          disabled={atMax}
          aria-label="Progress plus one"
          className="flex size-7 items-center justify-center rounded-md border border-line-strong text-ink-soft transition-colors hover:border-signal hover:text-signal disabled:opacity-30 disabled:pointer-events-none"
        >
          +
        </button>
      </div>
      <div className="hidden shrink-0 sm:block">
        <ScoreInput
          score={item.entry.score}
          format={profile?.scoreFormat ?? "POINT_10_DECIMAL"}
          onCommit={(score) => change({ score })}
          compact
        />
      </div>
    </div>
  );
}

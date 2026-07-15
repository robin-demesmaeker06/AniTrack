import { useMemo, useState } from "react";
import { useNews } from "./useNews";
import { useLibraryList } from "@/features/library/useLibrary";
import { timeAgo } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import type { NewsItem } from "@/types";

type Scope = "all" | "library";

const SOURCE_LABELS: Record<string, string> = {
  ann: "ANN",
  crunchyroll: "Crunchyroll",
};

/** News page (§6.7) — reverse-chron RSS aggregation, All vs My series. */
export function NewsPage() {
  const newsQuery = useNews();
  const listQuery = useLibraryList();
  const [scope, setScope] = useState<Scope>("all");

  const libraryIds = useMemo(
    () => new Set((listQuery.data ?? []).map((i) => i.entry.anilistMediaId)),
    [listQuery.data],
  );

  const visible = useMemo(() => {
    const items = newsQuery.data ?? [];
    if (scope === "all") return items;
    return items.filter(
      (n) => n.relatedAnilistMediaId != null && libraryIds.has(n.relatedAnilistMediaId),
    );
  }, [newsQuery.data, scope, libraryIds]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">News</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Headlines from Anime News Network.
          </p>
        </div>
        <div className="flex rounded-md border border-line-strong p-0.5">
          {(["all", "library"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                scope === s
                  ? "bg-signal text-on-signal"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {s === "all" ? "All" : "My series"}
            </button>
          ))}
        </div>
      </header>

      {newsQuery.isError ? (
        <EmptyState
          title="Couldn't load news"
          body="The feeds didn't answer. Give it a moment, then retry."
          action={
            <Button onClick={() => void newsQuery.refetch()}>Retry</Button>
          }
        />
      ) : newsQuery.isLoading ? (
        <div className="flex justify-center py-12 text-signal">
          <Spinner size={24} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={scope === "library" ? "Nothing for your series yet" : "No news yet"}
          body={
            scope === "library"
              ? "Matching headlines to your library is best-effort — switch to All to browse everything, or check a media page directly for its own news."
              : "The aggregator hasn't run yet, or the feed came back empty."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-signal/50"
    >
      {item.imageUrl && (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-card bg-raised sm:h-20 sm:w-28">
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span className="rounded bg-raised px-1.5 py-0.5 font-semibold uppercase tracking-wide text-ink-soft">
            {SOURCE_LABELS[item.source] ?? item.source}
          </span>
          {item.publishedAt && (
            <span className="numeric">{timeAgo(item.publishedAt)}</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium text-ink group-hover:text-signal-strong">
          {item.title}
        </p>
        {item.excerpt && (
          <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{item.excerpt}</p>
        )}
      </div>
    </a>
  );
}

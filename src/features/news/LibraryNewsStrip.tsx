import { useNewsForLibrary } from "./useNews";
import { timeAgo } from "@/lib/format";

/** Compact "News on your series" strip for Home (§6.7). Best-effort — RSS
 * items only surface here if news-fetch's title match found them; a library
 * with no matches yet just renders nothing (no empty-state noise on Home). */
export function LibraryNewsStrip({
  anilistMediaIds,
}: {
  anilistMediaIds: number[];
}) {
  const query = useNewsForLibrary(anilistMediaIds);
  const items = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="series-news-heading">
      <h2
        id="series-news-heading"
        className="mb-3 font-display text-base font-bold"
      >
        News on your series
      </h2>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 transition-colors hover:border-signal/50"
          >
            <p className="line-clamp-1 flex-1 text-sm text-ink group-hover:text-signal-strong">
              {item.title}
            </p>
            {item.publishedAt && (
              <span className="numeric shrink-0 text-xs text-ink-faint">
                {timeAgo(item.publishedAt)}
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}

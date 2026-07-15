import { Link } from "react-router";
import { useListEntryUpdate } from "@/features/library/useLibrary";
import { useProfile } from "@/features/profile/useProfile";
import { displayTitle } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import type { LibraryListItem } from "@/services/libraryService";

/**
 * Large cover card with one-tap +1 (§6.1). The +1 is optimistic via the
 * shared library-list cache; at the total it flips into a "Done?" action.
 */
export function ContinueCard({ item }: { item: LibraryListItem }) {
  const { data: profile } = useProfile();
  const update = useListEntryUpdate();
  const toast = useToast();
  const { entry, media } = item;

  const total =
    media == null
      ? null
      : entry.mediaType === "ANIME"
        ? media.episodes
        : media.chapters;
  const atMax = total != null && entry.progress >= total;
  const unit = entry.mediaType === "ANIME" ? "Ep" : "Ch";
  const href = `/media/${entry.mediaType.toLowerCase()}/${entry.anilistMediaId}`;
  const pct = total ? Math.min(100, (entry.progress / total) * 100) : 0;

  function change(changes: Parameters<typeof update.mutate>[0]["changes"]) {
    update.mutate(
      { current: entry, changes, total },
      { onError: () => toast("Change didn't save — try again.", "error") },
    );
  }

  return (
    <div className="w-32 shrink-0 md:w-36">
      <Link to={href} className="group block">
        <div className="relative aspect-[2/3] overflow-hidden rounded-card bg-raised">
          {media?.coverUrl && (
            <img
              src={media.coverUrl}
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
        <p className="mt-1.5 line-clamp-1 text-[13px] font-medium text-ink group-hover:text-signal-strong">
          {media
            ? displayTitle(media.titles, profile?.titleLanguage ?? "ENGLISH")
            : `#${entry.anilistMediaId}`}
        </p>
      </Link>
      <div className="mt-1 flex items-center justify-between">
        <span className="numeric text-xs text-ink-soft">
          {unit} {entry.progress}
          <span className="text-ink-faint">{total != null ? ` / ${total}` : ""}</span>
        </span>
        {atMax && entry.status !== "COMPLETED" ? (
          <button
            onClick={() => change({ status: "COMPLETED" })}
            className="rounded-md border border-success/50 px-2 py-1 text-[11px] font-medium text-success transition-colors hover:bg-success/10"
          >
            Done?
          </button>
        ) : (
          <button
            onClick={() => change({ progress: entry.progress + 1 })}
            disabled={atMax}
            aria-label={`${unit} plus one`}
            className="flex size-7 items-center justify-center rounded-md bg-signal text-base font-bold text-on-signal transition-colors hover:bg-signal-strong disabled:opacity-30 disabled:pointer-events-none"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

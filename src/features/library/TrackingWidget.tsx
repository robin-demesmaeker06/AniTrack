import { useState } from "react";
import { useProfile } from "@/features/profile/useProfile";
import { useLibraryEntry, useEntryMutations } from "./useLibrary";
import { ScoreInput } from "./ScoreInput";
import { statusLabel, ALL_STATUSES } from "@/lib/statusLabels";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { EntryStatus, LibraryEntry, Media } from "@/types";

/**
 * The heart of the app (§6.4): everything optimistic, every change
 * persisted + logged to activity_log via the service layer.
 */
export function TrackingWidget({ media }: { media: Media }) {
  const entryQuery = useLibraryEntry(media);
  const { add, update, remove, total } = useEntryMutations(media);
  const toast = useToast();

  if (entryQuery.isLoading) {
    return (
      <div className="mt-6 flex justify-center rounded-lg border border-line bg-surface p-6 text-signal">
        <Spinner />
      </div>
    );
  }

  const entry = entryQuery.data ?? null;
  const verb = media.mediaType === "ANIME" ? "watching" : "reading";

  if (!entry) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
        <Button
          onClick={() =>
            add.mutate("CURRENT", {
              onError: () => toast("Couldn't add — try again.", "error"),
            })
          }
        >
          Start {verb}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            add.mutate("PLANNING", {
              onError: () => toast("Couldn't add — try again.", "error"),
            })
          }
        >
          Plan to {media.mediaType === "ANIME" ? "watch" : "read"}
        </Button>
      </div>
    );
  }

  return <EntryEditor media={media} entry={entry} update={update} remove={remove} total={total ?? null} />;
}

function EntryEditor({
  media,
  entry,
  update,
  remove,
  total,
}: {
  media: Media;
  entry: LibraryEntry;
  update: ReturnType<typeof useEntryMutations>["update"];
  remove: ReturnType<typeof useEntryMutations>["remove"];
  total: number | null;
}) {
  const { data: profile } = useProfile();
  const toast = useToast();
  const [notesDraft, setNotesDraft] = useState(entry.notes ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);

  function change(changes: Parameters<typeof update.mutate>[0]["changes"]) {
    update.mutate(
      { current: entry, changes },
      { onError: () => toast("Change didn't save — try again.", "error") },
    );
  }

  const atMax = total != null && entry.progress >= total;
  const suggestCompleted = atMax && entry.status !== "COMPLETED" && total != null;
  const unit = media.mediaType === "ANIME" ? "Episode" : "Chapter";

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border border-signal/25 bg-surface p-4">
      {/* Status + remove */}
      <div className="flex items-center gap-3">
        <select
          value={entry.status}
          onChange={(e) => change({ status: e.target.value as EntryStatus })}
          aria-label="Status"
          className="rounded-md border border-line bg-raised px-3 py-2 text-sm font-medium text-ink focus:border-signal focus:outline-none"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s, media.mediaType)}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          {confirmRemove ? (
            <span className="flex items-center gap-2 text-sm">
              <button
                onClick={() =>
                  remove.mutate(entry, {
                    onError: () => toast("Couldn't remove — try again.", "error"),
                  })
                }
                className="text-danger hover:underline"
              >
                Really remove?
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-ink-faint hover:text-ink"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-sm text-ink-faint transition-colors hover:text-danger"
            >
              Remove from library
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Stepper
          label={unit}
          value={entry.progress}
          total={total}
          onChange={(progress) => change({ progress })}
        />
        {media.mediaType === "MANGA" && (
          <Stepper
            label="Volume"
            value={entry.progressVolumes ?? 0}
            total={media.volumes}
            onChange={(progressVolumes) => change({ progressVolumes })}
          />
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-ink-faint">Score</span>
          <ScoreInput
            score={entry.score}
            format={profile?.scoreFormat ?? "POINT_10_DECIMAL"}
            onCommit={(score) => change({ score })}
          />
        </div>
      </div>

      {suggestCompleted && (
        <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 px-3 py-2">
          <p className="text-sm text-ink">
            {unit} {total} reached — finished?
          </p>
          <Button
            variant="secondary"
            className="ml-auto !py-1 text-xs"
            onClick={() => change({ status: "COMPLETED" })}
          >
            Mark completed
          </Button>
        </div>
      )}

      {/* Dates */}
      <div className="flex flex-wrap gap-4">
        <DateField
          label="Started"
          value={entry.startedAt}
          onChange={(startedAt) => change({ startedAt })}
        />
        <DateField
          label="Finished"
          value={entry.finishedAt}
          onChange={(finishedAt) => change({ finishedAt })}
        />
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="entry-notes" className="text-xs uppercase tracking-wide text-ink-faint">
          Notes
        </label>
        <textarea
          id="entry-notes"
          rows={2}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            const value = notesDraft.trim() || null;
            if (value !== (entry.notes ?? null)) change({ notes: value });
          }}
          placeholder="Private notes…"
          className="w-full resize-y rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none"
        />
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  total,
  onChange,
}: {
  label: string;
  value: number;
  total: number | null | undefined;
  onChange: (value: number) => void;
}) {
  const stepClass =
    "flex size-8 items-center justify-center rounded-md border border-line-strong text-ink-soft transition-colors hover:border-signal hover:text-signal disabled:opacity-30 disabled:pointer-events-none";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label={`${label} minus one`}
        className={stepClass}
      >
        −
      </button>
      <span className="numeric min-w-14 text-center text-sm text-ink">
        {value}
        <span className="text-ink-faint"> / {total ?? "?"}</span>
      </span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={total != null && value >= total}
        aria-label={`${label} plus one`}
        className={stepClass}
      >
        +
      </button>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs uppercase tracking-wide text-ink-faint">
        {label}
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="numeric mt-1.5 block rounded-md border border-line bg-raised px-3 py-1.5 text-sm text-ink focus:border-signal focus:outline-none"
        />
      </label>
    </div>
  );
}

import { useState } from "react";
import {
  useAnilistConnection,
  useAnilistImport,
  useAnilistSyncToggle,
  useAnilistUnlink,
  usePendingSyncCount,
} from "./useAnilist";
import { isAnilistConfigured, startAnilistAuth } from "@/services/anilistLinkService";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { timeAgo } from "@/lib/format";

/** AniList link, import, and two-way push sync controls on Settings (§Phase 6). */
export function AniListSection() {
  const toast = useToast();
  const { data: connection, isLoading } = useAnilistConnection();
  const importMut = useAnilistImport();
  const unlinkMut = useAnilistUnlink();
  const syncToggle = useAnilistSyncToggle();
  const syncEnabled = connection?.syncEnabled ?? false;
  const { data: pendingCount } = usePendingSyncCount(Boolean(connection) && syncEnabled);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  function onToggleSync(next: boolean) {
    syncToggle.mutate(next, {
      onSuccess: () =>
        toast(
          next
            ? "Two-way sync on — your edits now push to AniList."
            : "Two-way sync off. Your edits stay local.",
          "success",
        ),
      onError: (err) =>
        toast(err instanceof Error ? err.message : "Couldn't update sync", "error"),
    });
  }

  function onImport() {
    importMut.mutate(undefined, {
      onSuccess: (r) =>
        toast(
          r.total === 0
            ? "Nothing to import — your AniList lists are empty."
            : `Imported ${r.imported}, updated ${r.updated}, kept ${r.skipped} local.`,
          "success",
        ),
      onError: (err) =>
        toast(err instanceof Error ? err.message : "Import failed", "error"),
    });
  }

  function onUnlink() {
    unlinkMut.mutate(undefined, {
      onSuccess: () => {
        setConfirmUnlink(false);
        toast("AniList unlinked. Your library stays put.", "success");
      },
      onError: (err) =>
        toast(err instanceof Error ? err.message : "Unlink failed", "error"),
    });
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-base font-bold">AniList</h2>
      <div className="mt-4 flex flex-col gap-4">
        {isLoading ? (
          <div className="flex justify-center py-2 text-signal">
            <Spinner size={20} />
          </div>
        ) : connection ? (
          <>
            <p className="text-sm text-ink-soft">
              Linked to AniList user{" "}
              <span className="font-medium text-ink">#{connection.anilistUserId}</span>.
              {connection.lastSyncedAt && <> Last import {timeAgo(connection.lastSyncedAt)}.</>}
            </p>
            <p className="text-xs text-ink-faint">
              Import pulls your AniList lists in. Where an entry exists in both,
              the more recently edited copy wins — local changes are never
              overwritten.
            </p>

            <div className="flex items-start justify-between gap-4 rounded-md border border-line bg-raised p-3">
              <div>
                <p className="text-sm font-medium text-ink">Push changes to AniList</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  When on, edits you make here sync back to your AniList list in
                  the background.
                  {syncEnabled && pendingCount ? (
                    <span className="text-ink-soft">
                      {" "}
                      {pendingCount} {pendingCount === 1 ? "change" : "changes"} waiting to
                      sync.
                    </span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={syncEnabled}
                aria-label="Push changes to AniList"
                disabled={syncToggle.isPending}
                onClick={() => onToggleSync(!syncEnabled)}
                className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-50 ${
                  syncEnabled ? "justify-end bg-signal" : "justify-start bg-line"
                }`}
              >
                <span className="block h-5 w-5 rounded-full bg-white shadow-sm transition-transform" />
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={onImport}
                loading={importMut.isPending}
                className="self-start"
              >
                Import my AniList library
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmUnlink(true)}
                disabled={importMut.isPending}
              >
                Unlink
              </Button>
            </div>
            {confirmUnlink && (
              <div className="flex flex-col gap-2 rounded-md border border-line bg-raised p-3">
                <p className="text-sm text-ink">
                  Unlink AniList? Your imported library stays; only the account
                  link is removed.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" loading={unlinkMut.isPending} onClick={onUnlink}>
                    Unlink
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmUnlink(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : isAnilistConfigured() ? (
          <>
            <p className="text-sm text-ink-soft">
              Link your AniList account to import your existing lists and, if you
              want, push your AniTrack edits back to AniList.
            </p>
            <Button
              variant="secondary"
              onClick={() => startAnilistAuth()}
              className="self-start"
            >
              Link AniList
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              AniList linking isn't configured on this deployment yet.
            </p>
            <Button variant="secondary" disabled className="self-start">
              Link AniList
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

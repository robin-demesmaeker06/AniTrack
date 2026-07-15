import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  addEntry,
  getEntry,
  getLibraryList,
  removeEntry,
  updateEntry,
  type EntryChanges,
  type LibraryListItem,
} from "@/services/libraryService";
import type { EntryStatus, LibraryEntry, Media } from "@/types";

function entryKey(userId: string | undefined, media: Media) {
  return ["library-entry", userId, media.mediaType, media.anilistMediaId];
}

export function useLibraryEntry(media: Media) {
  const { user } = useAuth();
  return useQuery({
    queryKey: entryKey(user?.id, media),
    queryFn: () => getEntry(user!.id, media.mediaType, media.anilistMediaId),
    enabled: Boolean(user),
    staleTime: 30 * 1000,
  });
}

export function useLibraryList() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["library-list", user?.id],
    queryFn: () => getLibraryList(user!.id),
    enabled: Boolean(user),
    staleTime: 30 * 1000,
  });
}

/**
 * Optimistic add/update/remove for one media's entry (§6.4, §10):
 * the entry cache updates instantly, list + lookup refresh on settle.
 */
export function useEntryMutations(media: Media) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = entryKey(user?.id, media);
  const total =
    media.mediaType === "ANIME" ? media.episodes : media.chapters;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["library-list", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["library-lookup", user?.id] });
  }

  const add = useMutation({
    mutationFn: (status: EntryStatus) => addEntry(user!.id, media, status),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LibraryEntry | null>(key);
      const optimistic: LibraryEntry = {
        id: "optimistic",
        userId: user!.id,
        anilistMediaId: media.anilistMediaId,
        mediaType: media.mediaType,
        status,
        progress: 0,
        progressVolumes: null,
        score: null,
        notes: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        anilistEntryId: null,
        syncedAt: null,
      };
      queryClient.setQueryData(key, optimistic);
      return { previous };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(key, ctx?.previous ?? null),
    onSettled: invalidateAll,
  });

  const update = useMutation({
    mutationFn: ({ current, changes }: { current: LibraryEntry; changes: EntryChanges }) =>
      updateEntry(current, changes, total),
    onMutate: async ({ current, changes }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LibraryEntry | null>(key);
      queryClient.setQueryData<LibraryEntry>(key, {
        ...current,
        status: changes.status ?? current.status,
        progress: changes.progress ?? current.progress,
        progressVolumes:
          changes.progressVolumes !== undefined
            ? changes.progressVolumes
            : current.progressVolumes,
        score: changes.score !== undefined ? changes.score : current.score,
        notes: changes.notes !== undefined ? changes.notes : current.notes,
        startedAt:
          changes.startedAt !== undefined ? changes.startedAt : current.startedAt,
        finishedAt:
          changes.finishedAt !== undefined ? changes.finishedAt : current.finishedAt,
        updatedAt: new Date().toISOString(),
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(key, ctx?.previous ?? null),
    onSettled: invalidateAll,
  });

  const remove = useMutation({
    mutationFn: (entry: LibraryEntry) => removeEntry(entry),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LibraryEntry | null>(key);
      queryClient.setQueryData(key, null);
      return { previous };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(key, ctx?.previous ?? null),
    onSettled: invalidateAll,
  });

  return { add, update, remove, total };
}

/** Quick edits from the library list — optimistically patches the list. */
export function useListEntryUpdate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listKey = ["library-list", user?.id];

  return useMutation({
    mutationFn: ({
      current,
      changes,
      total,
    }: {
      current: LibraryEntry;
      changes: EntryChanges;
      total: number | null;
    }) => updateEntry(current, changes, total),
    onMutate: async ({ current, changes }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<LibraryListItem[]>(listKey);
      if (previous) {
        queryClient.setQueryData<LibraryListItem[]>(
          listKey,
          previous.map((item) =>
            item.entry.id === current.id
              ? {
                  ...item,
                  entry: {
                    ...item.entry,
                    status: changes.status ?? item.entry.status,
                    progress: changes.progress ?? item.entry.progress,
                    score:
                      changes.score !== undefined ? changes.score : item.entry.score,
                    updatedAt: new Date().toISOString(),
                  },
                }
              : item,
          ),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: ["library-lookup", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["library-entry", user?.id] });
    },
  });
}

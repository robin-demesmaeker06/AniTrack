import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import { getLibraryLookup } from "@/services/libraryService";
import type { EntryStatus, MediaType } from "@/types";

/** Map of "TYPE:id" → status, for badging cards and the detail page. */
export function useLibraryLookup() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["library-lookup", user?.id],
    queryFn: () => getLibraryLookup(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  });

  const lookup = new Map<string, EntryStatus>();
  for (const entry of query.data ?? []) {
    lookup.set(`${entry.mediaType}:${entry.anilistMediaId}`, entry.status);
  }

  return {
    statusFor: (type: MediaType, id: number) =>
      lookup.get(`${type}:${id}`) ?? null,
  };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  exchangeAnilistCode,
  getAnilistConnection,
  getPendingSyncCount,
  importAnilistLibrary,
  setAnilistSyncEnabled,
  unlinkAnilist,
} from "@/services/anilistLinkService";

function connectionKey(userId: string | undefined) {
  return ["anilist-connection", userId];
}

/** AniList link status (null when not linked). */
export function useAnilistConnection() {
  const { user } = useAuth();
  return useQuery({
    queryKey: connectionKey(user?.id),
    queryFn: getAnilistConnection,
    enabled: Boolean(user),
  });
}

/** Exchange the OAuth code on the callback page. Refreshes link status. */
export function useAnilistExchange() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => exchangeAnilistCode(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKey(user?.id) });
    },
  });
}

/** Import AniList lists into the local library, then refresh library views. */
export function useAnilistImport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importAnilistLibrary,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library-list", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["library-lookup", user?.id] });
      void queryClient.invalidateQueries({ queryKey: connectionKey(user?.id) });
    },
  });
}

/** Unlink the AniList account (keeps local data). */
export function useAnilistUnlink() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unlinkAnilist,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKey(user?.id) });
    },
  });
}

/** Flip two-way push sync on/off. Refreshes link status on settle. */
export function useAnilistSyncToggle() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setAnilistSyncEnabled(enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionKey(user?.id) });
    },
  });
}

/** Count of local edits still waiting to push to AniList (polls while mounted). */
export function usePendingSyncCount(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["anilist-pending-sync", user?.id],
    queryFn: getPendingSyncCount,
    enabled: Boolean(user) && enabled,
    refetchInterval: 30 * 1000,
  });
}

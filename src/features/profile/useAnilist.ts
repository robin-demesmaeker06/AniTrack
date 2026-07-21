import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  exchangeAnilistCode,
  getAnilistConnection,
  importAnilistLibrary,
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

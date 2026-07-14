import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "@/services/profileService";
import type { Profile, ProfileUpdate } from "@/types";
import { useAuth } from "@/features/auth/AuthProvider";

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
}

/** Optimistic profile updates (§10) — the UI never waits on the network. */
export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: ProfileUpdate) => updateProfile(user!.id, update),
    onMutate: async (update) => {
      const key = ["profile", user?.id];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Profile>(key);
      if (previous) {
        queryClient.setQueryData<Profile>(key, { ...previous, ...update });
      }
      return { previous };
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["profile", user?.id], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}

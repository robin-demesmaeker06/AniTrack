import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} from "@/services/notificationService";
import type { AppNotification } from "@/types";

// Polling stands in for realtime until push lands — the drop job runs every
// 30 min anyway, so a 60s poll on the count is plenty.
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications-unread", user?.id],
    queryFn: () => getUnreadCount(user!.id),
    enabled: Boolean(user),
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
}

export function useNotifications(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: Boolean(user) && enabled,
    staleTime: 30 * 1000,
  });
}

export function useNotificationActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listKey = ["notifications", user?.id];
  const countKey = ["notifications-unread", user?.id];

  const patchList = (fn: (n: AppNotification) => AppNotification) => {
    const previous = queryClient.getQueryData<AppNotification[]>(listKey);
    if (previous) queryClient.setQueryData(listKey, previous.map(fn));
    return previous;
  };

  const markOne = useMutation({
    mutationFn: (id: string) => markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = patchList((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      const previousCount = queryClient.getQueryData<number>(countKey);
      if (typeof previousCount === "number") {
        queryClient.setQueryData(countKey, Math.max(0, previousCount - 1));
      }
      return { previousList, previousCount };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previousList) queryClient.setQueryData(listKey, ctx.previousList);
      if (typeof ctx?.previousCount === "number") {
        queryClient.setQueryData(countKey, ctx.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: countKey });
    },
  });

  const markAll = useMutation({
    mutationFn: () => markAllRead(user!.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = patchList((n) => ({ ...n, read: true }));
      const previousCount = queryClient.getQueryData<number>(countKey);
      queryClient.setQueryData(countKey, 0);
      return { previousList, previousCount };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previousList) queryClient.setQueryData(listKey, ctx.previousList);
      if (typeof ctx?.previousCount === "number") {
        queryClient.setQueryData(countKey, ctx.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: countKey });
    },
  });

  return { markOne, markAll };
}

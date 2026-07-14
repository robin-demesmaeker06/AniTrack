export type NotificationType = "NEW_EPISODE" | "NEW_CHAPTER" | "SYNC_ERROR";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  anilistMediaId: number | null;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

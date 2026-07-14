import type { MediaType } from "./media";

export type ActivityAction = "progress" | "status_change" | "score" | "added";

export interface ActivityItem {
  id: string;
  userId: string;
  action: ActivityAction;
  anilistMediaId: number;
  mediaType: MediaType;
  detail: Record<string, unknown>;
  createdAt: string;
}

import type { MediaType } from "./media";

export type EntryStatus =
  | "CURRENT"
  | "COMPLETED"
  | "PLANNING"
  | "PAUSED"
  | "DROPPED"
  | "REPEATING";

export interface LibraryEntry {
  id: string;
  userId: string;
  anilistMediaId: number;
  mediaType: MediaType;
  status: EntryStatus;
  progress: number;
  progressVolumes: number | null;
  /** Always 0–100 internally; display converts to the user's format. */
  score: number | null;
  notes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  anilistEntryId: number | null;
  syncedAt: string | null;
}

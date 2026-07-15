import type { EntryStatus, MediaType } from "@/types";

export const ALL_STATUSES: EntryStatus[] = [
  "CURRENT",
  "COMPLETED",
  "PLANNING",
  "PAUSED",
  "DROPPED",
  "REPEATING",
];

export function statusLabel(status: EntryStatus, type: MediaType): string {
  switch (status) {
    case "CURRENT":
      return type === "ANIME" ? "Watching" : "Reading";
    case "REPEATING":
      return type === "ANIME" ? "Rewatching" : "Rereading";
    case "COMPLETED":
      return "Completed";
    case "PLANNING":
      return "Planning";
    case "PAUSED":
      return "Paused";
    case "DROPPED":
      return "Dropped";
  }
}

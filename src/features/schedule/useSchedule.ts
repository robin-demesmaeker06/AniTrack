import { useQuery } from "@tanstack/react-query";
import { getAiringSchedule, type AiringSlot } from "@/services/anilistService";

/**
 * The schedule week is a rolling window: today plus the next six days,
 * in the browser's local timezone (§6.2). More useful than a Mon–Sun
 * calendar week — "what airs tonight" is always the first tab.
 */
export function getWeekDays(): Date[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Local-date key, e.g. "2026-07-15" — stable across DST boundaries. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useAiringWeek() {
  const days = getWeekDays();
  const start = Math.floor(days[0].getTime() / 1000);
  const end = start + 7 * 86400;

  const query = useQuery({
    // Keyed by local day so the cache rolls over at midnight.
    queryKey: ["airing-week", dayKey(days[0])],
    queryFn: () => getAiringSchedule(start, end),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const byDay = new Map<string, AiringSlot[]>();
  for (const day of days) byDay.set(dayKey(day), []);
  for (const slot of query.data ?? []) {
    const key = dayKey(new Date(slot.airingAt));
    byDay.get(key)?.push(slot);
  }
  for (const slots of byDay.values()) {
    slots.sort((a, b) => a.airingAt.localeCompare(b.airingAt));
  }

  return { ...query, days, byDay };
}

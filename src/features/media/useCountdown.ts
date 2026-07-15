import { useEffect, useState } from "react";

/** "2d 14h 03m" until the given ISO time; re-renders every 30s. */
export function useCountdown(targetIso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIso) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [targetIso]);

  if (!targetIso) return null;
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return null;

  const minutes = Math.floor(diff / 60_000) % 60;
  const hours = Math.floor(diff / 3_600_000) % 24;
  const days = Math.floor(diff / 86_400_000);

  if (days > 0) return `${days}d ${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${Math.max(minutes, 1)}m`;
}

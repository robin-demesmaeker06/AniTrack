import { EmptyState } from "@/components/ui/EmptyState";

export function SchedulePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Schedule</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The weekly airing calendar, in your timezone.
        </p>
      </header>
      <EmptyState
        title="Calendar arrives in Phase 5"
        body="Day-by-day airing times with countdowns, filtered to your library or all airing series."
      />
    </div>
  );
}

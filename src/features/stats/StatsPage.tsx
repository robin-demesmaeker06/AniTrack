import { useMemo } from "react";
import { Link } from "react-router";
import { useProfile } from "@/features/profile/useProfile";
import { useLibraryList } from "@/features/library/useLibrary";
import { computeStats, AVG_EPISODE_MINUTES } from "./stats";
import { ALL_STATUSES, statusLabel } from "@/lib/statusLabels";
import { formatScore } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import type { EntryStatus, MediaType } from "@/types";
import type { GenreCount } from "./stats";

/** Stats dashboard (§6.5) — every number here comes from the library list
 * already loaded by Home/Profile; nothing new to fetch. */
export function StatsPage() {
  const { data: profile } = useProfile();
  const listQuery = useLibraryList();
  const items = listQuery.data ?? [];
  const stats = useMemo(() => computeStats(items), [items]);
  const scoreFormat = profile?.scoreFormat ?? "POINT_10_DECIMAL";

  if (listQuery.isLoading) {
    return (
      <div className="flex justify-center py-16 text-signal">
        <Spinner size={24} />
      </div>
    );
  }

  if (stats.totalEntries === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader />
        <EmptyState
          title="Nothing to add up yet"
          body="Track a few series and your stats fill in here."
          action={
            <Link
              to="/explore/anime"
              className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-on-signal hover:bg-signal-strong"
            >
              Explore anime →
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Episodes watched" value={stats.episodesWatched} />
        <StatCard label="Chapters read" value={stats.chaptersRead} />
        <StatCard
          label="Days watched"
          value={stats.estimatedDaysWatched.toFixed(1)}
          hint={`Est. · ${AVG_EPISODE_MINUTES} min/ep`}
        />
        <StatCard
          label="Mean score"
          value={
            stats.meanScore !== null ? formatScore(stats.meanScore, scoreFormat) : "–"
          }
          hint={stats.ratedCount > 0 ? `${stats.ratedCount} rated` : "Nothing rated yet"}
        />
      </section>

      <section aria-labelledby="status-heading">
        <h2 id="status-heading" className="mb-3 font-display text-base font-bold">
          Status breakdown
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusPanel title="Anime" type="ANIME" counts={stats.statusCounts.ANIME} />
          <StatusPanel title="Manga" type="MANGA" counts={stats.statusCounts.MANGA} />
        </div>
      </section>

      {stats.topGenres.length > 0 && (
        <section aria-labelledby="genre-heading">
          <h2 id="genre-heading" className="mb-3 font-display text-base font-bold">
            Top genres
          </h2>
          <GenreBars genres={stats.topGenres} />
        </section>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <header>
      <h1 className="font-display text-2xl font-bold">Stats</h1>
      <p className="mt-1 text-sm text-ink-soft">
        A read on your library, recomputed from what's already tracked.
      </p>
    </header>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="numeric text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

function StatusPanel({
  title,
  type,
  counts,
}: {
  title: string;
  type: MediaType;
  counts: Record<EntryStatus, number>;
}) {
  const active = ALL_STATUSES.filter((s) => counts[s] > 0);
  const total = active.reduce((sum, s) => sum + counts[s], 0);
  const max = Math.max(1, ...active.map((s) => counts[s]));

  if (total === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong p-4 text-center text-xs text-ink-faint">
        No {title.toLowerCase()} tracked
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {title} · {total}
      </p>
      {active.map((s) => (
        <BarRow key={s} label={statusLabel(s, type)} count={counts[s]} max={max} />
      ))}
    </div>
  );
}

function GenreBars({ genres }: { genres: GenreCount[] }) {
  const max = Math.max(1, ...genres.map((g) => g.count));
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      {genres.map((g) => (
        <BarRow key={g.genre} label={g.genre} count={g.count} max={max} />
      ))}
    </div>
  );
}

function BarRow({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct = Math.max(4, (count / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-ink-soft sm:w-28">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
      </div>
      <span className="numeric w-6 shrink-0 text-right text-ink-faint">{count}</span>
    </div>
  );
}

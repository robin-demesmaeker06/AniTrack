import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useProfile } from "@/features/profile/useProfile";
import { useLibraryLookup } from "@/features/library/useLibraryLookup";
import { useAiringWeek, dayKey } from "./useSchedule";
import { useCountdown } from "@/features/media/useCountdown";
import type { AiringSlot } from "@/services/anilistService";
import { displayTitle } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { TitleLanguage } from "@/types";

type Scope = "all" | "library";

export function SchedulePage() {
  const { data: profile } = useProfile();
  const language = profile?.titleLanguage ?? "ENGLISH";
  const { days, byDay, isLoading, isError, refetch } = useAiringWeek();
  const { statusFor } = useLibraryLookup();
  const [scope, setScope] = useState<Scope>("all");
  const [selectedDay, setSelectedDay] = useState(() => dayKey(days[0]));

  const visibleByDay = useMemo(() => {
    const map = new Map<string, AiringSlot[]>();
    for (const [key, slots] of byDay) {
      map.set(
        key,
        scope === "library"
          ? slots.filter(
              (s) => statusFor(s.media.mediaType, s.media.anilistMediaId) !== null,
            )
          : slots,
      );
    }
    return map;
  }, [byDay, scope, statusFor]);

  const inLibrary = (slot: AiringSlot) =>
    statusFor(slot.media.mediaType, slot.media.anilistMediaId) !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* pr keeps the scope toggle clear of the floating notification bell */}
      <header className="flex flex-wrap items-end justify-between gap-3 pr-12">
        <div>
          <h1 className="font-display text-2xl font-bold">Schedule</h1>
          <p className="mt-1 text-sm text-ink-soft">
            The weekly airing calendar, in your timezone.
          </p>
        </div>
        <ScopeToggle scope={scope} onChange={setScope} />
      </header>

      {/* Day strip — the §10 signature element. Tabs on mobile, the week
          header on desktop. */}
      <div
        role="tablist"
        aria-label="Day"
        className="grid grid-cols-7 gap-1 md:gap-2"
      >
        {days.map((day, i) => {
          const key = dayKey(day);
          const count = visibleByDay.get(key)?.length ?? 0;
          return (
            <DayTab
              key={key}
              day={day}
              isToday={i === 0}
              count={isLoading ? null : count}
              selected={selectedDay === key}
              onSelect={() => setSelectedDay(key)}
            />
          );
        })}
      </div>

      {isError ? (
        <EmptyState
          title="Couldn't load the schedule"
          body="AniList didn't answer. Give it a moment, then retry."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading ? (
        <ScheduleSkeleton />
      ) : (
        <>
          {/* Mobile: the selected day's list */}
          <div className="md:hidden">
            <DayColumn
              slots={visibleByDay.get(selectedDay) ?? []}
              language={language}
              inLibrary={inLibrary}
              scope={scope}
              withCountdown={selectedDay === dayKey(days[0])}
            />
          </div>

          {/* Desktop: seven columns */}
          <div className="hidden md:grid md:grid-cols-7 md:gap-2">
            {days.map((day, i) => (
              <DayColumn
                key={dayKey(day)}
                slots={visibleByDay.get(dayKey(day)) ?? []}
                language={language}
                inLibrary={inLibrary}
                scope={scope}
                withCountdown={i === 0}
                compact
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function ScopeToggle({
  scope,
  onChange,
}: {
  scope: Scope;
  onChange: (s: Scope) => void;
}) {
  const options: Array<{ value: Scope; label: string }> = [
    { value: "all", label: "All airing" },
    { value: "library", label: "My list" },
  ];
  return (
    <div className="flex rounded-md border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={scope === o.value}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
            scope === o.value
              ? "bg-signal text-on-signal"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DayTab({
  day,
  isToday,
  count,
  selected,
  onSelect,
}: {
  day: Date;
  isToday: boolean;
  count: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const weekday = isToday
    ? "Today"
    : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day);
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex flex-col items-center gap-0.5 rounded-md border py-2 transition-colors md:pointer-events-none ${
        selected
          ? "border-signal bg-signal/10 md:border-line md:bg-transparent"
          : "border-line hover:border-line-strong"
      } ${isToday ? "md:border-signal md:bg-signal/10" : ""}`}
    >
      <span
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          isToday ? "text-signal" : "text-ink-soft"
        }`}
      >
        {weekday}
      </span>
      <span className="numeric text-sm font-medium">{day.getDate()}</span>
      <span className="numeric text-[10px] text-ink-faint">
        {count === null ? "–" : count}
      </span>
    </button>
  );
}

function DayColumn({
  slots,
  language,
  inLibrary,
  scope,
  withCountdown,
  compact = false,
}: {
  slots: AiringSlot[];
  language: TitleLanguage;
  inLibrary: (slot: AiringSlot) => boolean;
  scope: Scope;
  withCountdown: boolean;
  compact?: boolean;
}) {
  if (slots.length === 0) {
    return compact ? (
      <p className="pt-4 text-center text-xs text-ink-faint">Nothing</p>
    ) : (
      <EmptyState
        title={scope === "library" ? "Nothing from your list" : "Nothing airing"}
        body={
          scope === "library"
            ? "None of your tracked series air this day. Switch to All airing to browse."
            : "A quiet day — nothing scheduled on AniList."
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {slots.map((slot) => (
        <AiringRow
          key={`${slot.media.anilistMediaId}-${slot.episode}`}
          slot={slot}
          language={language}
          highlighted={inLibrary(slot)}
          withCountdown={withCountdown}
          compact={compact}
        />
      ))}
    </ul>
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function AiringRow({
  slot,
  language,
  highlighted,
  withCountdown,
  compact,
}: {
  slot: AiringSlot;
  language: TitleLanguage;
  highlighted: boolean;
  withCountdown: boolean;
  compact: boolean;
}) {
  const upcoming =
    withCountdown && new Date(slot.airingAt).getTime() > Date.now();
  const countdown = useCountdown(upcoming ? slot.airingAt : null);
  const title = displayTitle(slot.media.titles, language);
  const href = `/media/anime/${slot.media.anilistMediaId}`;

  return (
    <li>
      <Link
        to={href}
        className={`flex items-center gap-2.5 rounded-card border bg-surface px-2 py-1.5 transition-colors hover:border-signal/60 ${
          highlighted ? "border-signal/50" : "border-line"
        }`}
      >
        <span className="numeric w-11 shrink-0 text-xs text-ink-soft">
          {timeFormat.format(new Date(slot.airingAt))}
        </span>
        {!compact && slot.media.coverUrl && (
          <img
            src={slot.media.coverUrl}
            alt=""
            loading="lazy"
            className="h-12 w-9 shrink-0 rounded-sm object-cover"
          />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-medium ${
              compact ? "text-xs" : "text-sm"
            } ${highlighted ? "text-signal-strong" : "text-ink"}`}
          >
            {title}
          </span>
          <span className="numeric mt-0.5 block text-[11px] text-ink-faint">
            Ep {slot.episode}
            {countdown ? ` · in ${countdown}` : ""}
          </span>
        </span>
        {highlighted && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-signal"
            aria-label="In your library"
          />
        )}
      </Link>
    </li>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 md:grid md:grid-cols-7 md:gap-2">
      {Array.from({ length: 7 }).map((_, col) => (
        <div
          key={col}
          className={`flex-col gap-1.5 ${col === 0 ? "flex" : "hidden md:flex"}`}
        >
          {Array.from({ length: 4 }).map((_, row) => (
            <div
              key={row}
              className="h-[52px] animate-pulse rounded-card border border-line bg-raised/60"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

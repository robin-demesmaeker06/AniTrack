import { useEffect, useState } from "react";
import { formatScore, parseScoreInput } from "@/lib/format";
import type { ScoreFormat } from "@/types";

const placeholders: Record<ScoreFormat, string> = {
  POINT_10: "1–10",
  POINT_10_DECIMAL: "e.g. 8.5",
  POINT_5: "0.5–5",
};

/**
 * Score entry in the user's chosen format; stores 0–100 internally (§4).
 * Commits on blur or Enter; invalid input snaps back.
 */
export function ScoreInput({
  score,
  format,
  onCommit,
  compact = false,
}: {
  score: number | null;
  format: ScoreFormat;
  onCommit: (score: number | null) => void;
  compact?: boolean;
}) {
  const display = score == null || score === 0 ? "" : formatScore(score, format).replace("★", "");
  const [draft, setDraft] = useState(display);

  useEffect(() => setDraft(display), [display]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (score != null) onCommit(null);
      return;
    }
    const parsed = parseScoreInput(trimmed, format);
    if (parsed == null || parsed === 0) {
      setDraft(display); // invalid — snap back
      return;
    }
    if (parsed !== score) onCommit(parsed);
    else setDraft(display);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label="Score"
      placeholder={compact ? "–" : placeholders[format]}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(display);
      }}
      className={`numeric rounded-md border border-line bg-surface text-ink focus:border-signal focus:outline-none ${
        compact ? "w-12 px-1.5 py-0.5 text-xs text-center" : "w-24 px-3 py-2 text-sm"
      }`}
    />
  );
}

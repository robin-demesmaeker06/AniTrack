// Pure display helpers — no React, no I/O.
import type { MediaTitles, ScoreFormat, TitleLanguage } from "@/types";

/** Internal scores are always 0–100 (§4); these convert for display only. */
export function formatScore(score: number | null, format: ScoreFormat): string {
  if (score === null || score === 0) return "–";
  switch (format) {
    case "POINT_10":
      return String(Math.round(score / 10));
    case "POINT_10_DECIMAL":
      return (score / 10).toFixed(1);
    case "POINT_5":
      return `${(Math.round(score / 10) / 2).toFixed(1)}★`;
  }
}

/** Parses user input in their chosen format back to 0–100. */
export function parseScoreInput(
  input: string,
  format: ScoreFormat,
): number | null {
  const value = Number(input.replace(",", "."));
  if (Number.isNaN(value)) return null;
  let internal: number;
  switch (format) {
    case "POINT_10":
      internal = Math.round(value) * 10;
      break;
    case "POINT_10_DECIMAL":
      internal = Math.round(value * 10);
      break;
    case "POINT_5":
      internal = Math.round(value * 2) * 10;
      break;
  }
  if (internal < 0 || internal > 100) return null;
  return internal;
}

export function displayTitle(
  titles: MediaTitles,
  language: TitleLanguage,
): string {
  const order: Array<string | null> =
    language === "ENGLISH"
      ? [titles.english, titles.romaji, titles.native]
      : language === "ROMAJI"
        ? [titles.romaji, titles.english, titles.native]
        : [titles.native, titles.romaji, titles.english];
  return order.find((t): t is string => Boolean(t)) ?? "Untitled";
}

export function formatMemberSince(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

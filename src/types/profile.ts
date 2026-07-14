// Shared domain types — zero React imports (§2), liftable into a shared
// package when the native app arrives.

export type TitleLanguage = "ENGLISH" | "ROMAJI" | "NATIVE";

export type ScoreFormat = "POINT_10" | "POINT_10_DECIMAL" | "POINT_5";

export type ThemePref = "dark" | "light" | "system";

export interface Profile {
  id: string;
  username: string;
  avatarUrl: string | null;
  titleLanguage: TitleLanguage;
  scoreFormat: ScoreFormat;
  theme: ThemePref;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileUpdate {
  username?: string;
  avatarUrl?: string | null;
  titleLanguage?: TitleLanguage;
  scoreFormat?: ScoreFormat;
  theme?: ThemePref;
}

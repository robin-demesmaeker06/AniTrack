import { useEffect } from "react";
import { useProfile } from "./useProfile";
import type { ThemePref } from "@/types";

function apply(theme: ThemePref) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}

/** Applies the profile's theme to <html>. Dark is the default before load. */
export function ThemeApplier() {
  const { data: profile } = useProfile();
  const theme = profile?.theme ?? "dark";

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}

import { useEffect, useState } from "react";
import { useStore } from "@/state/store";

export type Theme = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";

function readSystemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Resolves the user's theme preference to a concrete light/dark theme, applies
 * it to `<html data-theme>`, and re-resolves when either the preference or the
 * OS theme changes. The return value is the effective theme — pass it to
 * components (like @pierre/diffs's `themeType`) that need a concrete value.
 */
export function useEffectiveTheme(): Theme {
  const preference = useStore((s) => s.themePreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(readSystemTheme);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const effective: Theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = effective;
  }, [effective]);

  return effective;
}

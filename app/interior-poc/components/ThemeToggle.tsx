"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("filippucci-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    window.localStorage.setItem("filippucci-theme", nextTheme);
    applyTheme(nextTheme);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold"
      onClick={toggleTheme}
      aria-label={isDark ? "Attiva tema chiaro" : "Attiva tema scuro"}
      title={isDark ? "Tema chiaro" : "Tema scuro"}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {isDark ? "☼" : "◐"}
      </span>
      <span className="hidden sm:inline">{isDark ? "Chiaro" : "Scuro"}</span>
    </button>
  );
}

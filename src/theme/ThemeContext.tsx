/**
 * Theme Context & Provider
 * ========================
 * Central React context that manages theme state across the app.
 *
 * Usage:
 *   import { useTheme } from '../theme/ThemeContext';
 *   const { theme, setTheme, themes } = useTheme();
 *
 * The provider reads/writes the theme preference to localStorage
 * under the key "magicbill_theme" and applies it as a data-theme
 * attribute on <html>.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeName = "dark" | "light" | "blue" | "indigo";

export interface ThemeOption {
  id: ThemeName;
  label: string;
  description: string;
  preview: {
    bg: string;
    panelBg: string;
    headerBg: string;
    sidebar: string;
    accent: string;
    text: string;
  };
}

export const THEMES: ThemeOption[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Easy on the eyes, perfect for night use",
    preview: { bg: "#0a0a0f", panelBg: "#111827", headerBg: "#1a1f2e", sidebar: "#0f1115", accent: "#ffffff", text: "#f0f0f5" },
  },
  {
    id: "light",
    label: "Light",
    description: "Clean and bright, ideal for well-lit spaces",
    preview: { bg: "#eef0f4", panelBg: "#ffffff", headerBg: "#e4e7ed", sidebar: "#f5f7fa", accent: "#000000", text: "#0f172a" },
  },
  {
    id: "blue",
    label: "Ocean Blue",
    description: "Cool, calm navy with a vivid blue accent",
    preview: { bg: "#0c1222", panelBg: "#111a2e", headerBg: "#162040", sidebar: "#0a1020", accent: "#3b82f6", text: "#e2e8f0" },
  },
  {
    id: "indigo",
    label: "Indigo",
    description: "Deep indigo with a rich violet accent",
    preview: { bg: "#0e0e1a", panelBg: "#17172b", headerBg: "#20203a", sidebar: "#0b0b16", accent: "#a78bfa", text: "#ece9fb" },
  }
];

const STORAGE_KEY = "magicbill_theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  themes: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) {
      return stored as ThemeName;
    }
  } catch {
    // localStorage unavailable
  }
  return "dark"; // default
}

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(getInitialTheme);

  // Apply on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage unavailable
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

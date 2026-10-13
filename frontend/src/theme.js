import { useSyncExternalStore } from "react";

const STORAGE_KEY = "collabspace-preferences";

export const ACCENTS = [
  { id: "blue", label: "Bleu", color: "#2563eb" },
  { id: "violet", label: "Violet", color: "#7c3aed" },
  { id: "emerald", label: "Émeraude", color: "#059669" },
  { id: "rose", label: "Rose", color: "#e11d48" },
  { id: "amber", label: "Ambre", color: "#d97706" },
  { id: "cyan", label: "Cyan", color: "#0891b2" },
];

export const DEFAULT_PREFERENCES = {
  mode: "system", // "light" | "dark" | "system"
  accent: "blue",
  editorFontSize: "medium", // "small" | "medium" | "large"
  editorFont: "sans", // "sans" | "serif"
  density: "comfortable", // "comfortable" | "compact"
  animations: true,
};

function loadPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }

    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set();

let preferences = loadPreferences();

function resolveMode(mode) {
  if (mode === "system") {
    return media.matches ? "dark" : "light";
  }

  return mode === "dark" ? "dark" : "light";
}

function applyToDocument() {
  const root = document.documentElement;
  const accent =
    ACCENTS.find((item) => item.id === preferences.accent) || ACCENTS[0];
  const mode = resolveMode(preferences.mode);

  root.dataset.theme = mode;
  root.dataset.fontSize = preferences.editorFontSize;
  root.dataset.editorFont = preferences.editorFont;
  root.dataset.density = preferences.density;
  root.dataset.motion = preferences.animations ? "on" : "off";

  root.style.setProperty("--accent", accent.color);
  root.style.colorScheme = mode;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // stockage indisponible : on ignore
  }
}

export function updatePreferences(patch) {
  preferences = { ...preferences, ...patch };
  persist();
  applyToDocument();
  notify();
}

export function resetPreferences() {
  preferences = { ...DEFAULT_PREFERENCES };
  persist();
  applyToDocument();
  notify();
}

// Le mode "système" suit le changement de thème de Windows en direct
media.addEventListener("change", () => {
  if (preferences.mode === "system") {
    preferences = { ...preferences };
    applyToDocument();
    notify();
  }
});

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return preferences;
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, getSnapshot);

  return {
    preferences: current,
    resolvedMode: resolveMode(current.mode),
    update: updatePreferences,
    reset: resetPreferences,
  };
}

// Application immédiate au chargement (évite le flash blanc)
applyToDocument();
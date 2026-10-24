const KEY = "rd_v2_appearance";

export const THEMES = [
  { id: "system", label: "Match this device" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const THEME_IDS = new Set(THEMES.map((t) => t.id));

function normalize(value = {}) {
  return { theme: THEME_IDS.has(value.theme) ? value.theme : "system" };
}

export function loadAppearance() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return normalize();
  }
}

export function saveAppearance(patch) {
  const next = normalize({ ...loadAppearance(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

export function resolveTheme(theme, prefersDark) {
  if (theme === "light" || theme === "dark") return theme;
  return prefersDark ? "dark" : "light";
}

export function appearanceFromSearch(search) {
  const theme = new URLSearchParams(search || "").get("theme");
  return THEME_IDS.has(theme) ? { theme } : {};
}

function prefersDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function applyAppearance(appearance = loadAppearance()) {
  const root = document.documentElement;
  const theme = resolveTheme(appearance.theme, prefersDark());
  delete root.dataset.palette;
  root.dataset.theme = theme;
  return theme;
}

export function startAppearance() {
  const fromLink = appearanceFromSearch(window.location.search);
  const appearance = Object.keys(fromLink).length ? saveAppearance(fromLink) : loadAppearance();
  applyAppearance(appearance);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyAppearance());
}

const KEY = "rd_v2_appearance";

export const PALETTES = [
  { id: "current", label: "Current" },
  { id: "archive", label: "Archive ink" },
  { id: "reading-room", label: "Reading room" },
  { id: "instrument", label: "Instrument" },
];

export const THEMES = [
  { id: "system", label: "Match this device" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const PALETTE_IDS = new Set(PALETTES.map((p) => p.id));
const THEME_IDS = new Set(THEMES.map((t) => t.id));

function normalize(value = {}) {
  return {
    theme: THEME_IDS.has(value.theme) ? value.theme : "light",
    palette: PALETTE_IDS.has(value.palette) ? value.palette : "current",
  };
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
  const params = new URLSearchParams(search || "");
  const out = {};
  if (PALETTE_IDS.has(params.get("palette"))) out.palette = params.get("palette");
  if (THEME_IDS.has(params.get("theme"))) out.theme = params.get("theme");
  return out;
}

function prefersDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function applyAppearance(appearance = loadAppearance()) {
  const root = document.documentElement;
  const theme = resolveTheme(appearance.theme, prefersDark());
  if (appearance.palette === "current") delete root.dataset.palette;
  else root.dataset.palette = appearance.palette;
  root.dataset.theme = theme;
  return theme;
}

export function startAppearance() {
  const fromLink = appearanceFromSearch(window.location.search);
  const appearance = Object.keys(fromLink).length ? saveAppearance(fromLink) : loadAppearance();
  applyAppearance(appearance);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyAppearance());
}

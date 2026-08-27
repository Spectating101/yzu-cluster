import { loadUserEmail } from "@/v2/deskSession";

const KEY = "rd_v2_settings";
const LAST_RESEARCH_SURFACE_KEY = "rd_v2_last_research_surface";

const RESEARCH_SURFACES = new Set(["library", "discover", "synthesis"]);

const DEFAULTS = {
  startup: "home",
  onSelect: "detail",
  discoverScope: "known",
  email: "",
};

function normalizeStartup(value) {
  return value === "resume" ? "resume" : "home";
}

function normalizeOnSelect(value) {
  return ["detail", "ask", "keep"].includes(value) ? value : "detail";
}

function normalizeDiscoverScope(value) {
  return value === "wide" ? "wide" : "known";
}

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    const email = stored.email || loadUserEmail() || "";
    // Compatibility for older settings that stored a literal default tab.
    // Home stays Home; a former research-surface default becomes Resume.
    const legacyStartup = stored.startup == null && stored.defaultTab && stored.defaultTab !== "home"
      ? "resume"
      : stored.startup;
    return {
      ...DEFAULTS,
      ...stored,
      startup: normalizeStartup(legacyStartup),
      onSelect: normalizeOnSelect(stored.onSelect),
      discoverScope: normalizeDiscoverScope(stored.discoverScope),
      email,
    };
  } catch {
    return { ...DEFAULTS, email: loadUserEmail() || "" };
  }
}

export function saveSettings(patch) {
  const current = loadSettings();
  const next = {
    ...current,
    ...patch,
  };
  next.startup = normalizeStartup(next.startup);
  next.onSelect = normalizeOnSelect(next.onSelect);
  next.discoverScope = normalizeDiscoverScope(next.discoverScope);
  delete next.defaultTab;
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function rememberResearchSurface(tab) {
  const normalized = String(tab || "").trim();
  if (!RESEARCH_SURFACES.has(normalized)) return false;
  localStorage.setItem(LAST_RESEARCH_SURFACE_KEY, normalized);
  return true;
}

export function loadLastResearchSurface() {
  try {
    const stored = String(localStorage.getItem(LAST_RESEARCH_SURFACE_KEY) || "").trim();
    return RESEARCH_SURFACES.has(stored) ? stored : "";
  } catch {
    return "";
  }
}

export function startupTab(settings = loadSettings()) {
  return settings?.startup === "resume" ? loadLastResearchSurface() || "home" : "home";
}

export function selectionRailTab(current = "detail", settings = loadSettings()) {
  if (settings?.onSelect === "keep") return current === "ask" ? "ask" : "detail";
  return settings?.onSelect === "ask" ? "ask" : "detail";
}

export function discoverScopeIsWide(settings = loadSettings()) {
  return settings?.discoverScope === "wide";
}

export const SETTINGS_RESEARCH_SURFACES = Object.freeze([...RESEARCH_SURFACES]);

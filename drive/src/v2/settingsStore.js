import { loadUserEmail, saveUserEmail } from "./deskSession.js";

const KEY = "rd_v2_settings";

const DEFAULTS = {
  defaultTab: "home",
  onSelect: "detail",
  email: "",
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    const email = stored.email || loadUserEmail() || "";
    return { ...DEFAULTS, ...stored, email };
  } catch {
    return { ...DEFAULTS, email: loadUserEmail() || "" };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** Clear browser-local research context email + workspace preferences. Does not clear desk tokens. */
export function resetLocalPreferences() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  saveUserEmail("");
  return { ...DEFAULTS, email: "" };
}

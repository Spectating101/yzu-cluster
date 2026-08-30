const EMAIL_KEY = "procure_user_email";
const TOKEN_KEY = "desk_access_token";
const SESSION_KEY = "rd_v2_chat_session";
const SESSION_CONTEXT_PREFIX = `${SESSION_KEY}:context:`;
const DESK_SESSION_BOOTSTRAPPED_KEY = "rd_desk_session_bootstrapped";
const LEGACY_PILOT_EMAIL = "drkong@saturn.yzu.edu.tw";
const DISABLED_PILOT_EMAIL = "__pilot-preview-disabled__@invalid";

function explicitDemoMode() {
  try {
    return typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

function shouldRejectPilotEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === DISABLED_PILOT_EMAIL) return true;
  return normalized === LEGACY_PILOT_EMAIL && !explicitDemoMode();
}

/** Fetch/Headers-compatible: header names are always lowercase in our maps. */
function normalizeHeaderName(name) {
  return String(name || "").toLowerCase();
}

function flattenHeaderBag(extra = {}) {
  const out = {};
  if (!extra) return out;

  const assign = (key, value) => {
    if (key == null || key === "") return;
    out[normalizeHeaderName(key)] = value;
  };

  // Arrays first — they also have forEach, but mean [name, value] tuples.
  if (Array.isArray(extra)) {
    for (const pair of extra) {
      if (pair && pair.length >= 2) assign(pair[0], pair[1]);
    }
    return out;
  }

  // Headers instances do not spread; copy entries explicitly.
  if (typeof Headers !== "undefined" && extra instanceof Headers) {
    extra.forEach((value, key) => assign(key, value));
    return out;
  }
  if (typeof extra.forEach === "function" && typeof extra.entries === "function") {
    extra.forEach((value, key) => assign(key, value));
    return out;
  }

  for (const [key, value] of Object.entries(extra)) {
    assign(key, value);
  }
  return out;
}

/**
 * Desk API headers. When a browser-local token is present, send both
 * x-desk-token and authorization: Bearer — matching desk_auth.authorize().
 * Returned keys are lowercase (Fetch Headers normalization).
 * Terra donor: 7838e7c.
 */
export function deskHeaders(extra = {}) {
  const headers = {
    "content-type": "application/json",
    ...flattenHeaderBag(extra),
  };
  const token = loadDeskToken();
  if (token) {
    headers["x-desk-token"] = token;
    if (!headers.authorization) {
      headers.authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

/** Default fetch init for desk API calls (cookie session + optional pasted token). */
export function deskFetchInit(init = {}) {
  const options = { credentials: "include", ...(init || {}) };
  const headers = deskHeaders(options.headers || {});
  return { ...options, headers };
}

export function loadDeskToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveDeskToken(token) {
  const v = String(token || "").trim();
  try {
    if (v) sessionStorage.setItem(TOKEN_KEY, v);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  return v;
}

export function clearDeskToken() {
  saveDeskToken("");
}

export function hasDeskToken() {
  return Boolean(loadDeskToken());
}

export function markDeskSessionBootstrapped(ok = true) {
  try {
    if (ok) sessionStorage.setItem(DESK_SESSION_BOOTSTRAPPED_KEY, "1");
    else sessionStorage.removeItem(DESK_SESSION_BOOTSTRAPPED_KEY);
  } catch {
    /* ignore */
  }
}

export function deskSessionBootstrapped() {
  try {
    return sessionStorage.getItem(DESK_SESSION_BOOTSTRAPPED_KEY) === "1";
  } catch {
    return false;
  }
}

export function loadUserEmail() {
  try {
    const value = localStorage.getItem(EMAIL_KEY) || "";
    // Older showcase builds persisted the pilot professor as browser identity.
    // Normal researcher routes purge it; explicit ?demo=1 is the only place
    // where the historical showcase identity remains a valid browser choice.
    if (shouldRejectPilotEmail(value)) {
      localStorage.removeItem(EMAIL_KEY);
      return "";
    }
    return value;
  } catch {
    return "";
  }
}

export function saveUserEmail(email) {
  const v = String(email || "").trim();
  try {
    if (shouldRejectPilotEmail(v)) {
      localStorage.removeItem(EMAIL_KEY);
      return "";
    }
    if (v) localStorage.setItem(EMAIL_KEY, v);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
  return v;
}

function normalizedChatContextKey(contextKey = "") {
  return String(contextKey || "").trim();
}

/**
 * Chat sessions are scoped to the research object that owns them. Keeping one
 * global session made a new Discover question inherit an unrelated prior
 * investigation even though the visible rail had already rebound correctly.
 * Empty context retains the legacy key for callers that intentionally want a
 * general desk conversation.
 */
export function chatSessionStorageKey(contextKey = "") {
  const key = normalizedChatContextKey(contextKey);
  return key ? `${SESSION_CONTEXT_PREFIX}${encodeURIComponent(key).slice(0, 512)}` : SESSION_KEY;
}

export function loadChatSessionId(contextKey = "") {
  try {
    return localStorage.getItem(chatSessionStorageKey(contextKey)) || "";
  } catch {
    return "";
  }
}

export function saveChatSessionId(id, contextKey = "") {
  const value = String(id || "").trim();
  if (!value) return "";
  try {
    localStorage.setItem(chatSessionStorageKey(contextKey), value);
  } catch {
    /* ignore */
  }
  return value;
}

export function clearChatSessionId(contextKey = "") {
  try {
    localStorage.removeItem(chatSessionStorageKey(contextKey));
  } catch {
    /* ignore */
  }
}

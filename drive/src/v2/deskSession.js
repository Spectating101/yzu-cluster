const EMAIL_KEY = "procure_user_email";
const TOKEN_KEY = "desk_access_token";
const SESSION_KEY = "rd_v2_chat_session";
const SESSION_CONTEXT_PREFIX = `${SESSION_KEY}:context:`;
const DESK_SESSION_BOOTSTRAPPED_KEY = "rd_desk_session_bootstrapped";
export const DESK_IDENTITY_EVENT_KEY = "rd_desk_identity_changed";
let activePrincipal = "";
let identityGeneration = 0;

/** Server-observed identity scopes browser pointers; storage never grants access. */
export function bindDeskIdentity(principal = null) {
  const next = String(principal?.id || "");
  if (next === activePrincipal) return false;
  const previous = activePrincipal;
  activePrincipal = next;
  identityGeneration += 1;
  clearDeskToken();
  try {
    // Preserve the original operator's faculty preference, without lending it
    // to newly invited users. Legacy conversation pointers cannot establish an owner.
    if (!previous && principal?.role === "operator" && next === "desk-operator") {
      const legacyEmail = localStorage.getItem(EMAIL_KEY);
      if (legacyEmail && !localStorage.getItem(userEmailKey())) localStorage.setItem(userEmailKey(), legacyEmail);
      for (const key of ["rd_v2_settings", "rd_v2_recent_datasets", "rd_v2_last_research_surface"]) {
        const value = localStorage.getItem(key);
        if (value && !localStorage.getItem(deskStorageKey(key))) localStorage.setItem(deskStorageKey(key), value);
      }
      const legacySession = localStorage.getItem(SESSION_KEY);
      if (legacySession && !localStorage.getItem(chatSessionStorageKey())) localStorage.setItem(chatSessionStorageKey(), legacySession);
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(SESSION_CONTEXT_PREFIX)) {
          const context = decodeURIComponent(key.slice(SESSION_CONTEXT_PREFIX.length));
          if (!localStorage.getItem(chatSessionStorageKey(context))) localStorage.setItem(chatSessionStorageKey(context), localStorage.getItem(key));
        }
      }
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(EMAIL_KEY);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(SESSION_CONTEXT_PREFIX)) localStorage.removeItem(key);
    }
    sessionStorage.removeItem("rd.v2.resources.rollup.v1");
  } catch { /* Browser storage can be unavailable. */ }
  return true;
}

export function deskIdentityGeneration() { return identityGeneration; }
export function assertDeskIdentity(generation) {
  if (generation !== identityGeneration) throw new Error("Your account changed. This earlier request was discarded.");
}
export function notifyDeskIdentityChange() {
  try { localStorage.setItem(DESK_IDENTITY_EVENT_KEY, `${Date.now()}:${Math.random()}`); } catch { /* ignore */ }
}
function userEmailKey() { return activePrincipal ? `${EMAIL_KEY}:user:${encodeURIComponent(activePrincipal)}` : EMAIL_KEY; }
export function deskStorageKey(key) { return activePrincipal ? `${key}:user:${encodeURIComponent(activePrincipal)}` : key; }

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
    return localStorage.getItem(userEmailKey()) || "";
  } catch {
    return "";
  }
}

export function saveUserEmail(email) {
  const v = String(email || "").trim();
  if (v) localStorage.setItem(userEmailKey(), v);
  else localStorage.removeItem(userEmailKey());
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
  if (activePrincipal) return `${SESSION_KEY}:user:${encodeURIComponent(activePrincipal)}:context:${encodeURIComponent(key || "general").slice(0, 512)}`;
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

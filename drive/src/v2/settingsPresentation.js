/**
 * Settings centre + Detail rail presentation helpers.
 * Centre model is exactly Identity → Access → Defaults → Advanced recovery.
 * Detail shows active group label + 2–4 facts only — no Focus CTA, no Judgement paragraph.
 */

export const SETTINGS_SECTION_ORDER = Object.freeze([
  "identity",
  "access",
  "defaults",
  "advanced",
]);

export const SETTINGS_GROUP_LABELS = Object.freeze({
  identity: "Identity",
  access: "Access",
  defaults: "Defaults",
  advanced: "Advanced recovery",
});

/** Advanced recovery stays collapsed on the normal path. */
export function settingsAdvancedDefaultOpen() {
  return false;
}

export function assistantStatusFromHealth(health) {
  const desk = health?.desk || {};
  const explicit = desk.composer_configured;
  const legacy = desk.legacy_llm_configured;
  const model = String(desk.composer_model || desk.brain || "").trim();

  if (explicit === true || legacy === true) {
    return {
      ready: true,
      known: true,
      label: "Ready",
      detail: model ? `${model} runtime` : "Ask and acquisition planning",
    };
  }
  if (explicit === false && legacy !== true) {
    return { ready: false, known: true, label: "Needs setup", detail: "Assistant health reports offline" };
  }
  if (model && (explicit === true || legacy === true)) {
    return { ready: true, known: true, label: "Ready", detail: `${model} runtime` };
  }
  return { ready: false, known: false, label: "Not reported", detail: "No assistant signal on /health" };
}

export function deskAccessStatusFromHealth(health, { hasToken = false, sessionBootstrapped = false } = {}) {
  const desk = health?.desk || {};
  if (hasToken) return { ok: true, label: "Connected", detail: "Session fallback" };
  if (sessionBootstrapped || desk.desk_session_cookie) {
    return { ok: true, label: "Connected", detail: "Browser session" };
  }
  if (desk.desk_token_required) {
    return { ok: false, label: "Needs connection", detail: "Authorization required" };
  }
  if (health?.status === "ok") {
    return { ok: true, label: "Open", detail: "Desk reachable" };
  }
  if (!health) {
    return { ok: null, label: "Not reported", detail: "No /health payload yet" };
  }
  return { ok: false, label: "Check desk", detail: health.status || "Health degraded" };
}

export function archiveStatusFromHealth(health) {
  const gdrive = health?.desk?.gdrive;
  if (!gdrive) return { ok: null, label: "Not reported", detail: "No archive health on /health" };
  if (gdrive.ok === false || gdrive.ready === false) {
    return { ok: false, label: "Needs review", detail: "Archive connection" };
  }
  if (gdrive.ok === true || gdrive.ready === true || gdrive.drive_list_ok === true) {
    return { ok: true, label: "Connected", detail: "Research archive" };
  }
  return { ok: null, label: "Not reported", detail: "Archive signal incomplete" };
}

/**
 * Concise Detail facts for a settings group — 2–4 facts, truth-backed only.
 * No judgement paragraph, no Focus primary action (controls live in centre).
 */
export function buildSettingsRailState({
  group = "identity",
  settings = {},
  health = null,
  access = null,
  assistant = null,
  archive = null,
  profile = null,
  tokenPresent = false,
} = {}) {
  const g = SETTINGS_SECTION_ORDER.includes(group) ? group : "identity";
  const accessState = access || deskAccessStatusFromHealth(health);
  const assistantState = assistant || assistantStatusFromHealth(health);
  const archiveState = archive || archiveStatusFromHealth(health);
  const email = settings.email || "";
  const boundName =
    profile && !profile.unknown
      ? profile.name_en || profile.name || ""
      : "";

  if (g === "identity") {
    return {
      group: g,
      identity: [SETTINGS_GROUP_LABELS.identity],
      judgement: null,
      facts: [
        ["Faculty email", email || "Not set"],
        ["Context", boundName ? `Bound · ${boundName}` : email ? "Email saved · profile unresolved" : "Unbound"],
        ["Scope", "This browser only — not sign-in"],
      ].slice(0, 4),
      unknowns: [],
      primaryAction: null,
      secondaryActions: [],
      disclosure: null,
    };
  }

  if (g === "access") {
    return {
      group: g,
      identity: [SETTINGS_GROUP_LABELS.access],
      judgement: null,
      facts: [
        ["Ask / Composer", assistantState.label],
        ["Research archive", archiveState.label],
        ["Desk", accessState.label],
      ].slice(0, 4),
      unknowns: [],
      primaryAction: null,
      secondaryActions: [],
      disclosure: null,
    };
  }

  if (g === "defaults") {
    return {
      group: g,
      identity: [SETTINGS_GROUP_LABELS.defaults],
      judgement: null,
      facts: [
        ["Default tab", settings.defaultTab || "home"],
        ["On select", settings.onSelect === "ask" ? "Open Ask" : "Show Detail"],
        ["Scope", "This browser only"],
      ].slice(0, 4),
      unknowns: [],
      primaryAction: null,
      secondaryActions: [],
      disclosure: null,
    };
  }

  const deskPort =
    typeof window !== "undefined" ? `:${window.location.port || "8765"}` : ":8765";

  return {
    group: g,
    identity: [SETTINGS_GROUP_LABELS.advanced],
    judgement: null,
    facts: [
      ["Fallback token", tokenPresent ? "Present" : "Absent"],
      ["Bootstrap", health?.desk ? "Health received" : "Not received"],
      ["Port", deskPort],
    ].slice(0, 4),
    unknowns: [],
    primaryAction: null,
    secondaryActions: [],
    disclosure: null,
  };
}

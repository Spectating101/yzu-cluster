/**
 * Settings binding contract — Identity → Access → Defaults → Advanced recovery.
 * Detail rail: ≤5 facts, never Loading when settings/health exist.
 */
import test from "node:test";
import assert from "node:assert/strict";

export const SETTINGS_SECTION_ORDER = Object.freeze([
  "identity",
  "access",
  "defaults",
  "advanced",
]);

export function settingsAdvancedDefaultOpen() {
  return false;
}

export function assistantStatusFromHealth(health) {
  const desk = health?.desk || {};
  if (!health?.desk) return { ready: false, known: false, label: "Not reported" };
  if (desk.composer_configured === true) return { ready: true, known: true, label: "Ready" };
  if (desk.composer_configured === false) return { ready: false, known: true, label: "Needs setup" };
  return { ready: false, known: false, label: "Not reported" };
}

export function buildSettingsDetailFacts({
  group = "identity",
  settings = {},
  health = null,
  tokenPresent = false,
} = {}) {
  const desk = health?.desk || {};
  const healthLoaded = Boolean(
    health?.desk &&
      ("composer_configured" in desk ||
        desk.mcp_tools?.total != null ||
        "gdrive" in desk ||
        "jobs" in desk),
  );
  const assistant = assistantStatusFromHealth(health);

  if (group === "identity") {
    return [
      ["Faculty email", settings.email || "Not set"],
      ["Profile routing", settings.email ? "Bound" : "Unbound"],
    ];
  }
  if (group === "access") {
    const rows = [
      ["Ask / Composer", assistant.label],
      ["Archive", desk.gdrive ? (desk.gdrive.ok === true ? "Connected" : "Needs review") : "Not reported"],
    ];
    if (desk.mcp_tools?.total != null) rows.push(["MCP tools", String(desk.mcp_tools.total)]);
    rows.push(["Health payload", healthLoaded ? health?.status || "received" : "Not reported"]);
    return rows.slice(0, 5);
  }
  if (group === "defaults") {
    return [
      ["Default tab", settings.defaultTab || "home"],
      ["On select", settings.onSelect === "ask" ? "Open Ask" : "Show Detail"],
    ];
  }
  return [
    ["Fallback token", tokenPresent ? "Present" : "Absent"],
    ["Bootstrap", healthLoaded ? "Health received" : "Not received"],
  ].slice(0, 5);
}

test("Settings centre model is Identity → Access → Defaults → Advanced", () => {
  assert.deepEqual(SETTINGS_SECTION_ORDER, ["identity", "access", "defaults", "advanced"]);
});

test("Advanced recovery disclosure defaults to collapsed", () => {
  assert.equal(settingsAdvancedDefaultOpen(), false);
});

test("assistant status never invents Ready without composer_configured", () => {
  assert.equal(assistantStatusFromHealth(null).label, "Not reported");
  assert.equal(assistantStatusFromHealth({ desk: {} }).label, "Not reported");
  assert.equal(
    assistantStatusFromHealth({ desk: { composer_configured: true } }).label,
    "Ready",
  );
  assert.equal(
    assistantStatusFromHealth({ desk: { composer_configured: false } }).label,
    "Needs setup",
  );
});

test("Settings Detail facts stay ≤5 and never say Loading", () => {
  for (const group of SETTINGS_SECTION_ORDER) {
    const facts = buildSettingsDetailFacts({
      group,
      settings: { email: "a@b.edu", defaultTab: "home", onSelect: "detail" },
      health: { status: "ok", desk: { composer_configured: true, gdrive: { ok: true } } },
      tokenPresent: false,
    });
    assert.ok(facts.length >= 1 && facts.length <= 5, group);
    assert.doesNotMatch(JSON.stringify(facts), /Loading/i);
    assert.ok(facts.every(([, v]) => v != null && String(v).trim() !== ""));
  }
});

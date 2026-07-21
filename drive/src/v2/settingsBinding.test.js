import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_SECTION_ORDER,
  buildSettingsRailState,
  settingsAdvancedDefaultOpen,
} from "./settingsPresentation.js";
export { SETTINGS_SECTION_ORDER, settingsAdvancedDefaultOpen };
export function buildSettingsDetailFacts(opts = {}) {
  return buildSettingsRailState(opts).facts;
}
test("Settings centre model is Identity → Access → Defaults → Advanced", () => {
  assert.deepEqual(SETTINGS_SECTION_ORDER, ["identity", "access", "defaults", "advanced"]);
});
test("Advanced recovery disclosure defaults to collapsed", () => {
  assert.equal(settingsAdvancedDefaultOpen(), false);
});
test("Settings Detail facts stay 2–4 and never Focus", () => {
  for (const group of SETTINGS_SECTION_ORDER) {
    const rail = buildSettingsRailState({
      group,
      settings: { email: "a@b.edu", defaultTab: "home", onSelect: "detail" },
      health: { status: "ok", desk: { composer_configured: true, gdrive: { ok: true } } },
    });
    assert.ok(rail.facts.length >= 2 && rail.facts.length <= 4, group);
    assert.equal(rail.primaryAction, null, group);
  }
});

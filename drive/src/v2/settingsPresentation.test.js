import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_SECTION_ORDER,
  assistantStatusFromHealth,
  buildSettingsRailState,
  settingsAdvancedDefaultOpen,
} from "./settingsPresentation.js";

test("Settings centre model is Identity → Access → Defaults → Advanced recovery", () => {
  assert.deepEqual(SETTINGS_SECTION_ORDER, ["identity", "access", "defaults", "advanced"]);
});
test("Advanced recovery disclosure defaults to collapsed", () => {
  assert.equal(settingsAdvancedDefaultOpen(), false);
});
test("assistant status never claims Ready without health contract", () => {
  assert.equal(assistantStatusFromHealth(null).label, "Not reported");
  assert.equal(assistantStatusFromHealth({ desk: { composer_configured: true } }).label, "Ready");
});
test("Settings Detail rail has 2–4 facts and no Focus action", () => {
  const identity = buildSettingsRailState({
    group: "identity",
    settings: { email: "drkong@saturn.yzu.edu.tw" },
    profile: { name_en: "Kong, De-Rong" },
  });
  assert.equal(identity.primaryAction, null);
  assert.ok(identity.facts.length >= 2 && identity.facts.length <= 4);
});

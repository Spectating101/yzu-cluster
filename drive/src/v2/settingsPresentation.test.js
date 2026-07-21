import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_SECTION_ORDER,
  assistantStatusFromHealth,
  buildSettingsRailState,
  settingsAdvancedDefaultOpen,
} from "./settingsPresentation.js";

test("Settings centre model is Identity → Access → Defaults → Advanced recovery", () => {
  assert.deepEqual(SETTINGS_SECTION_ORDER, [
    "identity",
    "access",
    "defaults",
    "advanced",
  ]);
});

test("Advanced recovery disclosure defaults to collapsed", () => {
  assert.equal(settingsAdvancedDefaultOpen(), false);
});

test("assistant status never claims Ready without health contract", () => {
  assert.equal(assistantStatusFromHealth(null).label, "Not reported");
  assert.equal(assistantStatusFromHealth({}).label, "Not reported");
  assert.equal(assistantStatusFromHealth({ desk: {} }).ready, false);
  assert.equal(
    assistantStatusFromHealth({ desk: { composer_configured: true, composer_model: "composer-2.5" } })
      .label,
    "Ready",
  );
  assert.equal(
    assistantStatusFromHealth({ desk: { composer_configured: false } }).label,
    "Needs setup",
  );
});

test("Settings Detail rail never says Loading when settings/health data exists", () => {
  const identity = buildSettingsRailState({
    group: "identity",
    settings: { email: "drkong@saturn.yzu.edu.tw", defaultTab: "home" },
    health: { status: "ok", desk: { composer_configured: true } },
  });
  assert.equal(identity.group, "identity");
  assert.ok(identity.facts.length <= 5);
  assert.doesNotMatch(JSON.stringify(identity), /Loading/i);

  const access = buildSettingsRailState({
    group: "access",
    settings: { email: "" },
    health: { status: "ok", desk: { desk_token_required: false } },
  });
  assert.ok(access.facts.length <= 5);
  assert.doesNotMatch(JSON.stringify(access), /Loading/i);

  const advanced = buildSettingsRailState({
    group: "advanced",
    settings: {},
    health: { status: "ok", desk: { jobs: { pending_approval: 0, failed_recent: 2 } } },
  });
  assert.equal(advanced.group, "advanced");
  assert.match(advanced.judgement, /recovery/i);
  assert.doesNotMatch(JSON.stringify(advanced), /Loading/i);
});

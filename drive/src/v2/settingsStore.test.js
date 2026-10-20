import test from "node:test";
import assert from "node:assert/strict";

const memory = new Map();
global.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
};

const {
  discoverScopeIsWide,
  loadLastResearchSurface,
  loadSettings,
  rememberResearchSurface,
  saveSettings,
  selectionRailTab,
  startupTab,
} = await import("./settingsStore.js");

test.beforeEach(() => memory.clear());

test("resume remembers only research surfaces", () => {
  saveSettings({ startup: "resume" });
  assert.equal(rememberResearchSurface("settings"), false);
  assert.equal(rememberResearchSurface("profile"), false);
  assert.equal(rememberResearchSurface("resources"), false);
  assert.equal(loadLastResearchSurface(), "");
  assert.equal(startupTab(), "home");

  assert.equal(rememberResearchSurface("synthesis"), true);
  assert.equal(loadLastResearchSurface(), "synthesis");
  assert.equal(startupTab(), "synthesis");
});

test("legacy literal default tabs migrate to resume without preserving shell destinations", () => {
  localStorage.setItem("rd_v2_settings", JSON.stringify({ defaultTab: "library", onSelect: "detail" }));
  const settings = loadSettings();
  assert.equal(settings.startup, "resume");
  assert.equal(settings.onSelect, "detail");
});

test("evidence selection policy can preserve the current Inspector mode", () => {
  saveSettings({ onSelect: "keep" });
  assert.equal(selectionRailTab("ask"), "ask");
  assert.equal(selectionRailTab("detail"), "detail");
  saveSettings({ onSelect: "ask" });
  assert.equal(selectionRailTab("detail"), "ask");
});

test("Discover wide scope is an explicit workspace policy", () => {
  assert.equal(discoverScopeIsWide(), false);
  saveSettings({ discoverScope: "wide" });
  assert.equal(discoverScopeIsWide(), true);
});

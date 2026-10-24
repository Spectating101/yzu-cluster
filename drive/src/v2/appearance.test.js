import test from "node:test";
import assert from "node:assert/strict";

const memory = new Map();
global.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
};

const { THEMES, loadAppearance, saveAppearance, resolveTheme, appearanceFromSearch } = await import("./appearance.js");

test("defaults to following the device", () => {
  memory.clear();
  assert.deepEqual(loadAppearance(), { theme: "system" });
});

test("unknown stored values and retired palettes fall back to the default", () => {
  memory.clear();
  memory.set("rd_v2_appearance", JSON.stringify({ theme: "sepia", palette: "instrument" }));
  assert.deepEqual(loadAppearance(), { theme: "system" });
});

test("a saved theme is read back", () => {
  memory.clear();
  saveAppearance({ theme: "dark" });
  assert.deepEqual(loadAppearance(), { theme: "dark" });
});

test("system resolves from the browser preference; explicit choices win", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("a link can carry a theme to preview", () => {
  assert.deepEqual(appearanceFromSearch("?tab=library&theme=dark"), { theme: "dark" });
  assert.deepEqual(appearanceFromSearch("?palette=instrument"), {});
  assert.deepEqual(appearanceFromSearch(""), {});
});

test("every theme has a readable name", () => {
  for (const t of THEMES) assert.ok(t.id && t.label, JSON.stringify(t));
});

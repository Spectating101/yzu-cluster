import test from "node:test";
import assert from "node:assert/strict";

const memory = new Map();
global.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
};

const { PALETTES, loadAppearance, saveAppearance, resolveTheme, appearanceFromSearch } = await import("./appearance.js");

test("defaults to the light theme and the current palette", () => {
  memory.clear();
  assert.deepEqual(loadAppearance(), { theme: "light", palette: "current" });
});

test("unknown stored values fall back to the defaults", () => {
  memory.clear();
  saveAppearance({ theme: "sepia", palette: "neon" });
  assert.deepEqual(loadAppearance(), { theme: "light", palette: "current" });
});

test("a saved choice is read back", () => {
  memory.clear();
  saveAppearance({ theme: "dark", palette: "reading-room" });
  assert.deepEqual(loadAppearance(), { theme: "dark", palette: "reading-room" });
});

test("system resolves from the browser preference; explicit choices win", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("a link can carry a palette and theme to preview", () => {
  assert.deepEqual(appearanceFromSearch("?tab=library&palette=instrument&theme=dark"), { palette: "instrument", theme: "dark" });
  assert.deepEqual(appearanceFromSearch("?palette=nope"), {});
  assert.deepEqual(appearanceFromSearch(""), {});
});

test("every palette has a name a researcher can read", () => {
  for (const p of PALETTES) assert.ok(p.id && p.label, JSON.stringify(p));
  assert.equal(PALETTES[0].id, "current");
});

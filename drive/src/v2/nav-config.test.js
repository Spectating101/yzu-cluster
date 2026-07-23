import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SYNTHESIS_NAV_DEFERRED,
  SYNTHESIS_RELEASE_REDIRECT_TAB,
  normalizeReleaseTab,
} from "./releaseVisibility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const navSrc = readFileSync(join(__dirname, "nav-config.jsx"), "utf8");

test("Synthesis is deferred from the public sidebar for Discover/Library release", () => {
  assert.equal(SYNTHESIS_NAV_DEFERRED, true);
  assert.match(navSrc, /SYNTHESIS_NAV_DEFERRED/);
  assert.match(navSrc, /export const V2_SYNTHESIS_TAB/);
  assert.match(navSrc, /id: "synthesis"/);

  const block = navSrc.split("export const V2_SIDEBAR_TABS")[1].split("];")[0];
  assert.match(block, /id: "home"/);
  assert.match(block, /id: "library"/);
  assert.match(block, /id: "browse"/);
  assert.match(block, /id: "resources"/);
  assert.doesNotMatch(block, /id: "synthesis"/);
});

test("tab=synthesis normalizes to the Library release destination", () => {
  assert.equal(SYNTHESIS_RELEASE_REDIRECT_TAB, "library");
  assert.equal(normalizeReleaseTab("synthesis"), "library");
  assert.equal(normalizeReleaseTab("library"), "library");
  assert.equal(normalizeReleaseTab("browse"), "browse");
  assert.equal(normalizeReleaseTab("home"), "home");
});

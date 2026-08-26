import test from "node:test";
import assert from "node:assert/strict";
import { DISCOVER_TAB, canonicalTab, sameTab } from "./tabIdentity.js";

test("both spellings name one destination", () => {
  assert.equal(canonicalTab("browse"), DISCOVER_TAB);
  assert.equal(canonicalTab("discover"), DISCOVER_TAB);
  assert.equal(sameTab("browse", "discover"), true);
});

test("the canonical id is the one the nav shows the researcher", () => {
  assert.equal(DISCOVER_TAB, "discover");
});

test("every other tab is left alone", () => {
  for (const id of ["home", "library", "synthesis", "resources", "profile", "settings", "history"]) {
    assert.equal(canonicalTab(id), id);
  }
});

test("case and whitespace do not create a third name", () => {
  assert.equal(canonicalTab(" Browse "), DISCOVER_TAB);
  assert.equal(canonicalTab("DISCOVER"), DISCOVER_TAB);
});

test("an unknown tab is returned unchanged rather than guessed at", () => {
  assert.equal(canonicalTab("nonsense"), "nonsense");
  assert.equal(canonicalTab(""), "");
  assert.equal(canonicalTab(undefined), "");
});

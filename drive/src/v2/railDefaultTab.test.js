import test from "node:test";
import assert from "node:assert/strict";

import { railHasSelection, shownRailTab } from "./railDefaultTab.js";

test("an idle page has no selection", () => {
  for (const tab of ["home", "library", "discover", "browse", "synthesis", "resources", "profile", "settings"]) {
    assert.equal(railHasSelection({ tab }), false, tab);
  }
});

test("each page's own selection counts", () => {
  assert.equal(railHasSelection({ tab: "library", dataset: { dataset_id: "d1" } }), true);
  assert.equal(railHasSelection({ tab: "library", activeObject: { kind: "library_folder", folderId: "asia" } }), true);
  assert.equal(railHasSelection({ tab: "browse", browseTarget: { title: "x" } }), true);
  assert.equal(railHasSelection({ tab: "discover", historyEvent: { id: "h" } }), true);
  assert.equal(railHasSelection({ tab: "discover", discoverAssessment: { active: true } }), true);
  assert.equal(railHasSelection({ tab: "discover", discoverRestingSummary: { hasResults: true } }), true);
  assert.equal(railHasSelection({ tab: "discover", discoverMode: "history" }), true);
  assert.equal(railHasSelection({ tab: "synthesis", activeObject: { kind: "synthesis_thread" } }), true);
  assert.equal(railHasSelection({ tab: "resources", resourceRow: { id: "r" } }), true);
  assert.equal(railHasSelection({ tab: "home", activeObject: { kind: "home_attention" } }), true);
  assert.equal(railHasSelection({ tab: "home", activeObject: { kind: "home_attention", passive: true } }), false);
});

test("the whole Library at its root is not a selection", () => {
  assert.equal(railHasSelection({ tab: "library", activeObject: { kind: "library_folder", folderId: "" } }), false);
});

test("another page's object does not count as a selection here", () => {
  assert.equal(railHasSelection({ tab: "synthesis", dataset: { dataset_id: "d1" } }), false);
  assert.equal(railHasSelection({ tab: "library", activeObject: { kind: "synthesis_thread" } }), false);
  assert.equal(railHasSelection({ tab: "home", dataset: { dataset_id: "d1" }, activeObject: { kind: "dataset", owner: "library" } }), false);
});

test("with nothing selected the panel shows Ask unless Detail was chosen", () => {
  assert.equal(shownRailTab({ railTab: "detail", hasSelection: false, canAsk: true }), "ask");
  assert.equal(shownRailTab({ railTab: "detail", hasSelection: false, canAsk: true, detailPinned: true }), "detail");
  assert.equal(shownRailTab({ railTab: "ask", hasSelection: false, canAsk: true }), "ask");
});

test("an explicit switch to Ask is never overridden by an earlier Detail choice", () => {
  assert.equal(shownRailTab({ railTab: "ask", hasSelection: false, canAsk: true, detailPinned: true }), "ask");
});

test("a selection shows whichever tab is current", () => {
  assert.equal(shownRailTab({ railTab: "detail", hasSelection: true, canAsk: true }), "detail");
  assert.equal(shownRailTab({ railTab: "ask", hasSelection: true, canAsk: true }), "ask");
});

test("guests keep the current tab, since Ask needs a member", () => {
  assert.equal(shownRailTab({ railTab: "detail", hasSelection: false, canAsk: false }), "detail");
});

test("on a phone the panel is a sheet over the page, so it keeps the current tab", () => {
  assert.equal(shownRailTab({ railTab: "detail", hasSelection: false, canAsk: true, compact: true }), "detail");
});

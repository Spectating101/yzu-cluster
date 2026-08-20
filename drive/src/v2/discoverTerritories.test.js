import test from "node:test";
import assert from "node:assert/strict";
import { TERRITORIES, centreCount, discoverTerritories, unaccounted } from "./discoverTerritories.js";

// resultGroups carries four groups; the counter row showed three. A DataCite
// row classified external-discoverable then rendered in the centre while every
// visible counter read 0.
const groups = { available: [], external: [{ id: "doi" }], held: [], context: [] };

test("every group resultGroups builds is named by a territory", () => {
  assert.deepEqual(unaccounted(groups), []);
});

test("the row carries exactly the three counters the freeze binds", () => {
  const shown = discoverTerritories(groups).map((t) => t.label);
  assert.deepEqual(shown, ["Available", "Library evidence", "Web context"],
    "DISCOVER_ADAPTIVE_FREEZE_2026-07-28 §3 binds this row to three counters");
});

test("the orphan group folds into Available rather than earning a label", () => {
  const available = discoverTerritories(groups).find((t) => t.id === "available");
  assert.equal(available.count, 1, "the external-discoverable row must be counted");
});

test("the centre count is the sum of the centre territories", () => {
  assert.equal(centreCount(groups), 1);
  assert.equal(
    centreCount({ available: [1, 2], external: [3], held: [4, 5, 6], context: [7] }),
    3,
  );
});

test("no counter row can read all zeros while the centre holds a row", () => {
  const shown = discoverTerritories(groups);
  const total = shown.reduce((n, t) => n + t.count, 0);
  assert.ok(centreCount(groups) <= total, "centre must never exceed what the counters name");
  assert.ok(total > 0, "a rendered offering must move at least one counter");
});

test("a group added later without a territory is reported, not hidden", () => {
  assert.deepEqual(unaccounted({ ...groups, probed: [{ id: "x" }] }), ["probed"]);
});

test("held and context stay out of the centre count", () => {
  assert.equal(centreCount({ available: [], external: [], held: [1, 2], context: [3] }), 0);
  assert.equal(TERRITORIES.filter((t) => t.inCentre).map((t) => t.id).join(), "available");
});

test("an empty payload is valid and reads zero", () => {
  assert.equal(centreCount(undefined), 0);
  assert.equal(discoverTerritories(undefined).length, 3);
});

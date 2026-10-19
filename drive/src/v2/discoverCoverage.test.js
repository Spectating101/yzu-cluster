import test from "node:test";
import assert from "node:assert/strict";
import { coverageShelves, coverageSplit, coverageSummary, shelfBar } from "./discoverCoverage.js";

const held = (id, pid, extra = {}) => ({
  dataset_id: id, partition_id: pid, analysis_readiness: "instant",
  local_root: "data_lake/x", backend: "local_csv", ...extra,
});
const LANES = [
  { partition_id: "markets.equity", shelf_id: "markets", registry_dataset_ids: ["a","b","c"] },
  { partition_id: "derived.panels", shelf_id: "derived" },
  { partition_id: "reference.maps", shelf_id: "reference" },
  { partition_id: "catalog.index", shelf_id: "catalog" },
  { partition_id: "ops.collection", shelf_id: "ops" },
];
const SHELVES = [
  { id: "markets", label: "Markets" }, { id: "derived", label: "Derived" },
  { id: "reference", label: "Reference" }, { id: "catalog", label: "Catalog" },
];
const catalog = [
  held("a", "markets.equity"), held("b", "markets.equity"), held("c", "markets.equity"),
  held("d", "derived.panels"), held("e", "derived.panels"),
  held("f", "reference.maps"),
  { dataset_id: "g", partition_id: "catalog.index", access_shape: "catalog_reference" },
  held("ops1", "ops.collection", { partition_id: "ops.collection" }),
];

test("shelves are ranked by size and carry readable labels", () => {
  const shelves = coverageShelves(catalog, LANES, SHELVES);
  assert.equal(shelves[0].label, "Markets");
  assert.equal(shelves[0].total, 3);
  assert.ok(shelves.every((s, i) => i === 0 || s.total <= shelves[i - 1].total));
});

test("the totals on screen add up to the rows behind them", () => {
  const s = coverageSummary(catalog, LANES, SHELVES);
  assert.equal(s.total, s.shelves.reduce((n, x) => n + x.total, 0));
  assert.equal(s.held + s.declaredNotHeld, s.total);
});

test("a catalogue reference counts as searched but not held", () => {
  const s = coverageSummary([{ dataset_id: "g", partition_id: "catalog.index", access_shape: "catalog_reference" }]);
  assert.equal(s.total, 1);
  assert.equal(s.held, 0);
  assert.equal(s.declaredNotHeld, 1);
});

test("held can never exceed what the shelf contains", () => {
  for (const shelf of coverageShelves(catalog, LANES, SHELVES)) {
    assert.ok(shelf.held <= shelf.total, `${shelf.label} claims more held than it holds`);
    assert.ok(shelf.queryReady <= shelf.total);
  }
});

test("the split keeps the largest shelves and folds the tail", () => {
  const { listed, folded } = coverageSplit(catalog, LANES, SHELVES, 2);
  assert.equal(listed.length, 2);
  assert.equal(listed.length + folded.length, coverageShelves(catalog, LANES, SHELVES).length);
});

test("bars are relative to the largest shelf, so lengths compare", () => {
  const shelves = coverageShelves(catalog, LANES, SHELVES);
  assert.equal(shelfBar(shelves[0], shelves), 100);
  assert.ok(shelfBar(shelves[shelves.length - 1], shelves) <= 100);
});

test("a row with no shelf is grouped rather than dropped", () => {
  const s = coverageSummary([{ dataset_id: "x", analysis_readiness: "instant", local_root: "d", backend: "local_csv" }], LANES, SHELVES);
  assert.equal(s.total, 1);
  assert.equal(s.shelves[0].label, "Other");
});

test("an empty catalog reads zero and renders no shelves", () => {
  assert.deepEqual(coverageShelves([]), []);
  assert.equal(coverageSummary([]).total, 0);
});

test("the lane's membership list wins over the row's own field", () => {
  const lanes = [{ partition_id: "markets.equity", shelf_id: "markets", registry_dataset_ids: ["stray"] }];
  const shelves = coverageShelves([{ dataset_id: "stray", partition_id: "derived.panels",
    analysis_readiness: "instant", local_root: "d", backend: "local_csv" }], lanes,
    [{ id: "markets", label: "Markets" }]);
  assert.equal(shelves[0].label, "Markets", "row field must not override lane membership");
});

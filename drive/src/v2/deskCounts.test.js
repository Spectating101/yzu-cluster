import test from "node:test";
import assert from "node:assert/strict";
import {
  deskCounts,
  libraryEvidence,
  libraryHoldings,
  libraryReferences,
  libraryVisible,
  registryTotal,
} from "./deskCounts.js";

const held = (id, extra = {}) => ({
  dataset_id: id, analysis_readiness: "instant", local_root: "data_lake/x",
  backend: "local_csv", ...extra,
});
const rows = [
  held("panel_a"),
  held("panel_b"),
  held("ops_collector_manifest", { partition_id: "ops.collection" }),
  { dataset_id: "catalogue_only", access_shape: "catalog_reference" },
];

test("each count answers a different question and says which", () => {
  const c = deskCounts(rows);
  assert.equal(c.registry, 4);
  assert.ok(c.libraryVisible <= c.registry);
  assert.ok(c.libraryEvidence <= c.libraryVisible);
  assert.ok(c.libraryEvidence <= c.heldForClassification);
  assert.equal(c.libraryEvidence + c.libraryReferences, c.libraryVisible);
});

test("library evidence never exceeds what the Library shows", () => {
  assert.ok(libraryEvidence(rows) <= libraryVisible(rows),
    "a sentence saying 'Library evidence' cannot report more than the Library holds");
});

test("a catalogue reference is registered but not held", () => {
  const only = [{
    dataset_id: "catalogue_only",
    access_shape: "catalog_reference",
    registered: true,
    registry_id: "catalogue_only",
    local_path: "data_lake/catalogue/catalogue_only.json",
  }];
  assert.equal(registryTotal(only), 1);
  assert.equal(libraryEvidence(only), 0);
  assert.equal(libraryReferences(only), 1);
  assert.deepEqual(libraryHoldings(only), []);
});

test("empty input is valid and reads zero everywhere", () => {
  assert.deepEqual(deskCounts([]), {
    registry: 0, libraryVisible: 0, libraryReferences: 0, heldForClassification: 0, libraryEvidence: 0,
  });
  assert.deepEqual(deskCounts(), {
    registry: 0, libraryVisible: 0, libraryReferences: 0, heldForClassification: 0, libraryEvidence: 0,
  });
});

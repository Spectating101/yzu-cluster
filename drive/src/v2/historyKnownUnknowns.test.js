import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyKnownUnknowns } from "./historyKnownUnknowns.js";

describe("historyKnownUnknowns", () => {
  it("says nothing when the record carries no proof fields", () => {
    const result = historyKnownUnknowns({ meta: {} }, null);
    assert.deepEqual(result.known, []);
    assert.deepEqual(result.unknowns, []);
    assert.equal(result.hasEvidence, false);
  });

  it("treats absent proofs as silent, not as unknowns", () => {
    const result = historyKnownUnknowns({ meta: { dataset_id: "d1", job_id: "j1" } }, null);
    assert.equal(result.hasEvidence, false);
  });

  it("promotes true proofs to known", () => {
    const result = historyKnownUnknowns(
      { meta: { archive_verified: true, registry_readback: true } },
      null,
    );
    assert.ok(result.known.includes("Archived copy verified"));
    assert.ok(result.known.includes("Library record confirmed"));
    assert.deepEqual(result.unknowns, []);
  });

  it("demotes false proofs to unknowns", () => {
    const result = historyKnownUnknowns(
      { meta: { archive_verified: false, registry_readback: false } },
      null,
    );
    assert.ok(result.unknowns.includes("Archived copy not verified"));
    assert.ok(result.unknowns.includes("Library record not confirmed"));
    assert.deepEqual(result.known, []);
  });

  it("reads proofs off the event when meta omits them", () => {
    const result = historyKnownUnknowns({ archive_verified: true }, null);
    assert.deepEqual(result.known, ["Archived copy verified"]);
  });

  it("prefers meta over the event for the same proof", () => {
    const result = historyKnownUnknowns(
      { archive_verified: true, meta: { archive_verified: false } },
      null,
    );
    assert.deepEqual(result.unknowns, ["Archived copy not verified"]);
    assert.deepEqual(result.known, []);
  });

  it("counts a reconciled catalog as known", () => {
    const result = historyKnownUnknowns(
      { meta: { catalog_reconciliation: { state: "reconciled" } } },
      null,
    );
    assert.deepEqual(result.known, ["Library listing up to date"]);
  });

  it("shows a loaded Library record as known instead of an unresolved reconciliation", () => {
    const result = historyKnownUnknowns({ catalog_reconciliation: { state: "catalog_loaded" } }, null);
    assert.deepEqual(result.known, ["Current Library record loaded"]);
    assert.deepEqual(result.unknowns, []);
  });

  it("counts any other catalog state as an unknown, carrying the state", () => {
    const result = historyKnownUnknowns(
      { meta: { catalog_reconciliation: { state: "pending_promotion" } } },
      null,
    );
    assert.deepEqual(result.unknowns, ["Library listing pending promotion"]);
  });

  it("carries registered and receipt-only from holding truth", () => {
    const result = historyKnownUnknowns(
      { meta: { registry_readback: true } },
      { registered: true, receiptOnly: true },
    );
    assert.ok(result.known.includes("The save record includes evidence that the Library record was read back"));
    assert.ok(!result.known.includes("Listed in the Library"));
    assert.ok(result.unknowns.includes("Current Library listing not loaded"));
  });

  it("does not invent a holding claim when truth is absent", () => {
    const result = historyKnownUnknowns({ meta: { archive_verified: true } }, undefined);
    assert.deepEqual(result.known, ["Archived copy verified"]);
  });

  it("survives a null event", () => {
    const result = historyKnownUnknowns(null, null);
    assert.equal(result.hasEvidence, false);
  });
});

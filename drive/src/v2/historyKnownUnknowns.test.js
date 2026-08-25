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
    assert.ok(result.known.includes("Archive verified"));
    assert.ok(result.known.includes("Registry read-back confirmed"));
    assert.deepEqual(result.unknowns, []);
  });

  it("demotes false proofs to unknowns", () => {
    const result = historyKnownUnknowns(
      { meta: { archive_verified: false, registry_readback: false } },
      null,
    );
    assert.ok(result.unknowns.includes("Archive not verified"));
    assert.ok(result.unknowns.includes("Registry read-back not confirmed"));
    assert.deepEqual(result.known, []);
  });

  it("reads proofs off the event when meta omits them", () => {
    const result = historyKnownUnknowns({ archive_verified: true }, null);
    assert.deepEqual(result.known, ["Archive verified"]);
  });

  it("prefers meta over the event for the same proof", () => {
    const result = historyKnownUnknowns(
      { archive_verified: true, meta: { archive_verified: false } },
      null,
    );
    assert.deepEqual(result.unknowns, ["Archive not verified"]);
    assert.deepEqual(result.known, []);
  });

  it("counts a reconciled catalog as known", () => {
    const result = historyKnownUnknowns(
      { meta: { catalog_reconciliation: { state: "reconciled" } } },
      null,
    );
    assert.deepEqual(result.known, ["Catalog reconciled"]);
  });

  it("counts any other catalog state as an unknown, carrying the state", () => {
    const result = historyKnownUnknowns(
      { meta: { catalog_reconciliation: { state: "pending_promotion" } } },
      null,
    );
    assert.deepEqual(result.unknowns, ["Catalog reconciliation pending promotion"]);
  });

  it("carries registered and receipt-only from holding truth", () => {
    const result = historyKnownUnknowns({ meta: {} }, { registered: true, receiptOnly: true });
    assert.ok(result.known.includes("Registered in catalog"));
    assert.ok(result.unknowns.includes("Holding is receipt-only"));
  });

  it("does not invent a holding claim when truth is absent", () => {
    const result = historyKnownUnknowns({ meta: { archive_verified: true } }, undefined);
    assert.deepEqual(result.known, ["Archive verified"]);
  });

  it("survives a null event", () => {
    const result = historyKnownUnknowns(null, null);
    assert.equal(result.hasEvidence, false);
  });
});

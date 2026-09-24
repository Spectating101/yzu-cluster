import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { coverageSummary } from "./discoverCoverage.js";
import { libraryEvidence, libraryReferences } from "./deskCounts.js";

const fixture = JSON.parse(readFileSync(new URL("./deskCountsParity.fixture.json", import.meta.url), "utf8"));
const rows = Object.values(fixture).filter(Boolean);

test("Discover coverage reports the same held and referenced counts as the Library and header", () => {
  const coverage = coverageSummary(rows);
  assert.equal(libraryEvidence(rows), 2);
  assert.equal(coverage.held, libraryEvidence(rows));
  assert.equal(coverage.declaredNotHeld, libraryReferences(rows));
  assert.equal(coverage.queryReady, 1);
});

test("receipt-only placeholders count nowhere", () => {
  const withoutReceipt = rows.filter((row) => row !== fixture.receipt);
  assert.deepEqual(coverageSummary(rows), coverageSummary(withoutReceipt));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { libraryEvidence, libraryReferences } from "./deskCounts.js";

const fixture = JSON.parse(readFileSync(new URL("./deskCountsParity.fixture.json", import.meta.url), "utf8"));
const rows = Object.values(fixture).filter(Boolean);

test("held and referenced counts come from the shared fixture", () => {
  assert.equal(libraryEvidence(rows), 2);
  assert.equal(libraryReferences(rows), 1);
});

test("receipt-only placeholders count nowhere", () => {
  const withoutReceipt = rows.filter((row) => row !== fixture.receipt);
  assert.equal(libraryEvidence(rows), libraryEvidence(withoutReceipt));
  assert.equal(libraryReferences(rows), libraryReferences(withoutReceipt));
});

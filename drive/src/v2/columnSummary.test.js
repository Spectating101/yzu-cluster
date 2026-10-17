import assert from "node:assert/strict";
import { test } from "node:test";
import { columnBarFilter, columnBars, columnSummary, profileBasis, sampleReceipt } from "./columnSummary.js";

test("numbers read as a range, years stay years", () => {
  assert.equal(columnSummary({ kind: "number", min: 3.711599, max: 6.923532, filled: 120, empty: 0 }), "3.712 – 6.924");
  assert.equal(columnSummary({ kind: "number", min: 2015, max: 2024, filled: 10, empty: 0 }), "2015 – 2024");
});

test("dates read as a span and empties are noted", () => {
  assert.equal(columnSummary({ kind: "date", min: "2015-01-01", max: "2024-12-01T00:00:00", filled: 90, empty: 10 }), "2015-01-01 → 2024-12-01 · 10% empty");
});

test("text names a single value or counts distinct ones", () => {
  assert.equal(columnSummary({ kind: "text", distinct: 1, top: [{ value: "LRUNTTTTAUM156S", count: 120 }], filled: 120, empty: 0 }), "One value: LRUNTTTTAUM156S");
  assert.equal(columnSummary({ kind: "text", distinct: 3067, top: [], filled: 2000, empty: 0 }), "3,067 values");
  assert.equal(columnSummary({ kind: "empty", filled: 0, empty: 120 }), "All empty");
});

test("the receipt says when rows are a sample of a larger table", () => {
  assert.equal(sampleReceipt(8, 6, 120), "Sample of 8 from 120 rows · 6 columns");
  assert.equal(sampleReceipt(3, 1, 3), "3 rows · 1 column");
  assert.equal(profileBasis({ rows_profiled: 120, rows_total: 120, complete: true }), "Column summaries cover all 120 rows.");
  assert.equal(profileBasis({ rows_profiled: 2000, rows_total: 51234, complete: false }), "Column summaries cover the first 2,000 of 51,234 rows.");
});

test("column bars scale bins to the tallest and skip flat or missing ones", () => {
  assert.deepEqual(columnBars({ bins: [1, 4, 2] }), [0.25, 1, 0.5]);
  assert.deepEqual(columnBars({ bins: [3] }), []);
  assert.deepEqual(columnBars({ kind: "text" }), []);
});

test("categorical columns draw one bar per value", () => {
  assert.deepEqual(columnBars({ kind: "text", categorical: true, top: [{ value: "NY", count: 4 }, { value: "FL", count: 2 }] }), [1, 0.5]);
  assert.deepEqual(columnBars({ kind: "text", top: [{ value: "a", count: 4 }, { value: "b", count: 2 }] }), []);
});

test("a number bar selects the rows inside its bin, the last bin closed", () => {
  const filter = columnBarFilter({ kind: "number", min: 0, max: 30, bins: [2, 5, 1] }, 1);
  assert.equal(filter.label, "10 – 20");
  assert.equal(filter.count, 5);
  assert.deepEqual([9.99, 10, "15", "1,9", 20, null, ""].map(filter.matches), [false, true, true, true, false, false, false]);
  const last = columnBarFilter({ kind: "number", min: 0, max: 30, bins: [2, 5, 1] }, 2);
  assert.equal(last.matches(30), true);
  assert.equal(columnBarFilter({ kind: "number", min: 0, max: 30, bins: [2, 5, 1] }, 3), null);
});

test("a categorical bar selects one value", () => {
  const filter = columnBarFilter({ kind: "text", categorical: true, top: [{ value: "NY", count: 4 }, { value: "FL", count: 2 }] }, 1);
  assert.equal(filter.label, "FL");
  assert.deepEqual([" FL", "NY", null].map(filter.matches), [true, false, false]);
  assert.equal(columnBarFilter({ kind: "text", top: [{ value: "a", count: 4 }] }, 0), null);
});

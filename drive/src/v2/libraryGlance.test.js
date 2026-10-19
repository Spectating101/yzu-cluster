import test from "node:test";
import assert from "node:assert/strict";
import { rowsLabel, spanOf, spanAxis, barBox, spanText, glanceTitle } from "./libraryGlance.js";

test("row counts read at a glance", () => {
  assert.equal(rowsLabel(1), "1 row");
  assert.equal(rowsLabel(242), "242 rows");
  assert.equal(rowsLabel(9999), "9,999 rows");
  assert.equal(rowsLabel(34228), "34K rows");
  assert.equal(rowsLabel(107663470), "107.7M rows");
  assert.equal(rowsLabel(2_000_000), "2M rows");
  assert.equal(rowsLabel(3_400_000_000), "3.4B rows");
  assert.equal(rowsLabel(null), "");
  assert.equal(rowsLabel(-4), "");
});

test("a glance from the backend wins over the dataset's own fields", () => {
  const span = spanOf({ glance: { rows: 100, columns: 4, from: "1925-12-31", to: "2024-12-31" }, row_count: 5, coverage: "2000 → 2001" });
  assert.deepEqual([span.rows, span.columns, span.fromYear, span.toYear, span.ranged], [100, 4, 1925, 2024, true]);
});

test("older rows fall back to their row count and coverage text", () => {
  const span = spanOf({ row_count: 26051, coverage: "1925-12-31 → 2024-12-31" });
  assert.deepEqual([span.rows, span.fromYear, span.toYear], [26051, 1925, 2024]);
  assert.equal(spanOf({ coverage: { status: "partial" } }).ranged, false);
  assert.equal(spanOf({}).rows, null);
  assert.equal(spanOf({ row_count: null }).rows, null);
  assert.equal(spanOf({ row_count: 0 }).rows, 0);
});

test("a range that runs backwards or has no years is not drawn", () => {
  assert.equal(spanOf({ glance: { from: "2024", to: "1999" } }).ranged, false);
  assert.equal(spanOf({ glance: { from: "", to: "" } }).ranged, false);
});

test("the shared axis spans the earliest start to the latest end or this year", () => {
  const spans = [spanOf({ glance: { from: "1789", to: "2025" } }), spanOf({ glance: { from: "2016-09-25", to: "2026-09-25" } }), spanOf({})];
  assert.deepEqual(spanAxis(spans, 2026), { min: 1900, max: 2026 });
  const modern = [spanOf({ glance: { from: "1926", to: "2024" } }), spanOf({ glance: { from: "2016", to: "2026" } })];
  assert.deepEqual(spanAxis(modern, 2026), { min: 1926, max: 2026 });
  assert.equal(spanAxis([spanOf({})], 2026), null);
});

test("bars sit proportionally on the axis and never vanish or overflow", () => {
  const axis = { min: 1900, max: 2000 };
  assert.deepEqual(barBox(spanOf({ glance: { from: "1950", to: "1975" } }), axis), { left: 50, width: 25 });
  const tiny = barBox(spanOf({ glance: { from: "1950", to: "1950" } }), axis);
  assert.ok(tiny.width >= 2);
  const edge = barBox(spanOf({ glance: { from: "2000", to: "2000" } }), axis);
  assert.ok(edge.left + edge.width <= 100.0001);
  assert.equal(barBox(spanOf({}), axis), null);
});

test("a dataset that starts before the axis is drawn from its left edge", () => {
  const axis = { min: 1900, max: 2000 };
  const box = barBox(spanOf({ glance: { from: "1789", to: "1950" } }), axis);
  assert.deepEqual(box, { left: 0, width: 50 });
  const before = barBox(spanOf({ glance: { from: "1789", to: "1850" } }), axis);
  assert.ok(before.left === 0 && before.width >= 2);
});

test("labels and tooltips say the years and the facts", () => {
  assert.equal(spanText(spanOf({ glance: { from: "1789-01-01", to: "2025-01-01" } })), "1789–2025");
  assert.equal(spanText(spanOf({ glance: { from: "2020", to: "2020" } })), "2020");
  assert.equal(spanText(spanOf({})), "");
  assert.equal(glanceTitle(spanOf({ glance: { rows: 1200, columns: 3, from: "2020-01-02", to: "2021-06-30" } })), "1,200 rows · 3 columns · 2020-01-02 to 2021-06-30");
});

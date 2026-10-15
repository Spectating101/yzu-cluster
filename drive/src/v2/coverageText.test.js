import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageSpan, coverageText } from "./coverageText.js";

test("coverage records read as periods, never as object text", () => {
  const measured = { status: "complete", requested: { start: "2019-01", end: "2024-12" }, usable_cells: 1080, requested_cells: 1080 };
  assert.equal(coverageSpan(measured), "2019-01 → 2024-12");
  assert.equal(coverageText(measured), "2019-01 → 2024-12 · complete · 1080/1080 usable observations");
  assert.equal(coverageSpan({ rows: 1834, date_range: { start: "1871-01-01T00:00:00", end: "2023-09-01T00:00:00" } }), "1871-01-01 → 2023-09-01");
  assert.equal(coverageSpan({ start: "2015", end: "2024" }), "2015 → 2024");
  assert.equal(coverageSpan("2015–2026"), "2015–2026");
  assert.equal(coverageSpan(null), "");
  assert.doesNotMatch(coverageSpan({ columns: ["a"] }) + coverageText({ status: "complete" }), /object Object/);
});

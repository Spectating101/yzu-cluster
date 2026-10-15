import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRows, numericColumns, pageOf, sortRows, tableColumns } from "./dataTable.js";

const rows = [
  { date: "2024-01-03", taiex: 17559.31, note: "b" },
  { date: "2024-01-02", taiex: "17853.76", note: "" },
  { date: "2024-01-04", taiex: 9.66, extra: "x" },
];

test("every column across rows is shown, in first-seen order", () => {
  assert.deepEqual(tableColumns(rows), ["date", "taiex", "note", "extra"]);
});

test("numbers sort as numbers, text as text, blanks last", () => {
  assert.deepEqual(sortRows(rows, "taiex").map((r) => r.date), ["2024-01-04", "2024-01-03", "2024-01-02"]);
  assert.deepEqual(sortRows(rows, "taiex", "desc").map((r) => r.date), ["2024-01-02", "2024-01-03", "2024-01-04"]);
  assert.deepEqual(sortRows(rows, "note").map((r) => r.date), ["2024-01-03", "2024-01-02", "2024-01-04"]);
  assert.equal(sortRows(rows, ""), rows);
});

test("the filter matches any column, case-insensitively", () => {
  assert.deepEqual(filterRows(rows, "01-04", tableColumns(rows)).map((r) => r.date), ["2024-01-04"]);
  assert.deepEqual(filterRows(rows, "X", tableColumns(rows)).map((r) => r.date), ["2024-01-04"]);
  assert.equal(filterRows(rows, "  ", tableColumns(rows)), rows);
});

test("pages report their row range and clamp out-of-range pages", () => {
  const many = Array.from({ length: 242 }, (_, i) => ({ i }));
  assert.deepEqual({ ...pageOf(many, 0), rows: undefined }, { rows: undefined, page: 0, pages: 3, first: 1, last: 100 });
  assert.deepEqual({ ...pageOf(many, 9), rows: undefined }, { rows: undefined, page: 2, pages: 3, first: 201, last: 242 });
  assert.deepEqual({ ...pageOf([], 0), rows: undefined }, { rows: undefined, page: 0, pages: 1, first: 0, last: 0 });
});

test("columns whose values are all numbers are flagged for right alignment", () => {
  assert.deepEqual([...numericColumns(rows, tableColumns(rows))], ["taiex"]);
});

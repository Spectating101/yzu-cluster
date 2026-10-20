import test from "node:test";
import assert from "node:assert/strict";

import {
  blankSentence,
  describeColumn,
  groupColumns,
  surfaceBands,
  surfaceSummary,
} from "./columnSurface.js";

const col = (over = {}) => ({
  column: "v", kind: "measurement", rows: 100, blanks: 0, distinct: 90,
  typical_magnitude: 1, flags: [], ...over,
});

test("a kind is read as a phrase, never as a dtype", () => {
  assert.equal(describeColumn(col({ kind: "date" })).reads, "a date");
  assert.equal(describeColumn(col({ kind: "yes/no" })).reads, "yes / no");
  assert.equal(describeColumn(col({ kind: "score", distinct: 6 })).reads, "a score with 6 levels");
  assert.equal(describeColumn(col({ kind: "constant" })).reads, "one value throughout");
  assert.equal(
    describeColumn(col({ kind: "measurement", distinct: 112892 })).reads,
    "a measurement · 112,892 values",
  );
});

test("blanks are stated as rows, not as a percentage of non-null", () => {
  assert.equal(blankSentence(col({ blanks: 0 })), "none blank");
  assert.equal(blankSentence(col({ blanks: 481, rows: 1000 })), "481 rows are blank");
  assert.equal(blankSentence(col({ blanks: 100, rows: 100 })), "every row blank");
});

test("a flag becomes the reason it matters", () => {
  const described = describeColumn(col({ column: "fwd_5d", flags: ["lookahead"] }));
  assert.deepEqual(described.warnings, ["tells you the future"]);
});

test("a unit twin names its partner", () => {
  const described = describeColumn(
    col({ column: "return_1d", flags: ["unit_twin"], twin_of: "return_1d_pct" }),
  );
  assert.equal(described.warnings[0], "the same series as return_1d_pct, about 100× apart");
});

test("a sparse column reports the share of rows it is missing", () => {
  const described = describeColumn(col({ flags: ["sparse"], rows: 1000, blanks: 930 }));
  assert.equal(described.warnings[0], "blank in 93% of rows");
});

test("one column lands in one group, by severity", () => {
  const grouped = groupColumns([
    col({ column: "days_to_10pct", flags: ["sparse", "score"], rows: 100, blanks: 93 }),
  ]);
  const flags = grouped.groups.map((group) => group.flag);
  assert.deepEqual(flags, ["sparse"]);
  assert.equal(grouped.groups[0].columns.length, 1);
});

test("groups appear in severity order, worst first", () => {
  const grouped = groupColumns([
    col({ column: "s", flags: ["score"] }),
    col({ column: "f", flags: ["lookahead"] }),
    col({ column: "b", flags: ["sparse"], rows: 10, blanks: 9 }),
  ]);
  assert.deepEqual(grouped.groups.map((g) => g.flag), ["lookahead", "sparse", "score"]);
});

test("the columns in use are separated from everything else", () => {
  const grouped = groupColumns(
    [col({ column: "date", kind: "date" }), col({ column: "v" }), col({ column: "fwd_1d", flags: ["lookahead"] })],
    ["date", "v"],
  );
  assert.deepEqual(grouped.inUse.map((r) => r.column), ["date", "v"]);
  assert.equal(grouped.clean.length, 0);
  assert.equal(grouped.resolved, 1);
});

test("an unflagged column that is not in use is clean, not a warning", () => {
  const grouped = groupColumns([col({ column: "close" })], []);
  assert.deepEqual(grouped.clean.map((r) => r.column), ["close"]);
  assert.equal(grouped.groups.length, 0);
});

test("the summary names the largest group, so there is a reason to expand", () => {
  const grouped = groupColumns(
    [col({ column: "a" }), col({ column: "b" }), col({ column: "fwd_1d", flags: ["lookahead"] })],
    ["a"],
  );
  assert.equal(
    surfaceSummary(grouped),
    "1 of 3 columns in use · 1 excluded — they tell you the future",
  );
});

test("a second group is counted rather than listed, keeping the line one line", () => {
  const grouped = groupColumns([
    col({ column: "a" }),
    col({ column: "f1", flags: ["lookahead"] }),
    col({ column: "f2", flags: ["lookahead"] }),
    col({ column: "s", flags: ["score"] }),
  ], ["a"]);
  assert.equal(
    surfaceSummary(grouped),
    "1 of 4 columns in use · 2 excluded — they tell you the future · 1 more resolved",
  );
});

test("nothing resolved means the summary does not invent a second clause", () => {
  const grouped = groupColumns([col({ column: "a" })], ["a"]);
  assert.equal(surfaceSummary(grouped), "1 of 1 columns in use");
});

test("the stacked bar segments cover in-use, each group, and the rest", () => {
  const grouped = groupColumns([
    col({ column: "a" }), col({ column: "clean1" }),
    col({ column: "f1", flags: ["lookahead"] }),
  ], ["a"]);
  assert.deepEqual(
    surfaceBands(grouped).map((band) => [band.id, band.count]),
    [["inUse", 1], ["lookahead", 1], ["clean", 1]],
  );
});

test("an unknown kind is described rather than crashing", () => {
  assert.equal(describeColumn({ column: "x", kind: "mystery", flags: [] }).reads, "not described");
});

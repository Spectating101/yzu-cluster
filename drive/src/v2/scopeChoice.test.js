import test from "node:test";
import assert from "node:assert/strict";

import { scopeCanHelp, scopeHeadline, scopeOptions } from "./scopeChoice.js";

const REAL = {
  rows: 1043042, limit: 1000000,
  options: [
    { id: "2020", from: "2020-01-01", rows: 969392 },
    { id: "2021", from: "2021-01-01", rows: 816932 },
    { id: "2023", from: "2023-01-01", rows: 506163 },
  ],
};

test("the block is stated with how far over it is", () => {
  const scope = scopeOptions(REAL);
  assert.equal(scope.blocked, true);
  assert.equal(scope.over, 43042);
  assert.equal(scope.overPct, 4.3);
});

test("the recommendation is the smallest cut that clears, not the safest", () => {
  const scope = scopeOptions(REAL);
  assert.equal(scope.recommended.id, "2020");
  assert.equal(scope.options.find((o) => o.id === "2020").recommended, true);
  assert.equal(scope.options.find((o) => o.id === "2023").recommended, false);
});

test("each option says how much evidence it discards", () => {
  const scope = scopeOptions(REAL);
  assert.equal(scope.options.find((o) => o.id === "2020").discarded, 7.1);
  assert.equal(scope.options.find((o) => o.id === "2023").discarded, 51.5);
});

test("an option that does not clear is marked, not hidden", () => {
  const scope = scopeOptions({ ...REAL, options: [{ id: "all", rows: 1043042 }, ...REAL.options] });
  assert.equal(scope.options.find((o) => o.id === "all").clears, false);
  assert.equal(scope.recommended.id, "2020");
});

test("a construction under the limit is not blocked at all", () => {
  const scope = scopeOptions({ rows: 500, limit: 1000000, options: [] });
  assert.equal(scope.blocked, false);
  assert.equal(scopeHeadline(scope), "");
});

test("when no cut clears, the headline says the shape is wrong", () => {
  const scope = scopeOptions({
    rows: 206432820, limit: 1000000,
    options: [{ id: "2020", rows: 191899616 }, { id: "2023", rows: 100220274 }],
  });
  assert.equal(scopeCanHelp(scope), false);
  assert.match(scopeHeadline(scope), /join shape is the problem/);
});

test("the headline names both numbers when a cut can help", () => {
  assert.equal(scopeHeadline(scopeOptions(REAL)),
    "1,043,042 rows · the engine stops at 1,000,000");
});

test("no options is not an error", () => {
  const scope = scopeOptions(null);
  assert.deepEqual(scope.options, []);
  assert.equal(scope.recommended, null);
});

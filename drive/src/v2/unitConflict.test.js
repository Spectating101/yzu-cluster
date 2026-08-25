import test from "node:test";
import assert from "node:assert/strict";

import { formatResult, magnitudeGap, unitOutcomes, unitSpread } from "./unitConflict.js";

const RF = { column: "rf", typical: 0.0120 };
const RET = { column: "return_1d", typical: 0.0006 };

test("a magnitude gap is reported with which side is larger", () => {
  const gap = magnitudeGap(RET, RF);
  assert.equal(gap.ratio, 20);
  assert.equal(gap.suspicious, true);
  assert.equal(gap.larger, "rf");
});

test("columns of the same order are not flagged", () => {
  const gap = magnitudeGap({ column: "a", typical: 1.0 }, { column: "b", typical: 1.4 });
  assert.equal(gap.suspicious, false);
});

test("a zero or missing magnitude cannot be compared", () => {
  assert.equal(magnitudeGap(RET, { column: "z", typical: 0 }), null);
  assert.equal(magnitudeGap(RET, { column: "z" }), null);
});

test("both outcomes are carried, because showing one is what let the wrong one ship", () => {
  const outcomes = unitOutcomes({
    outcomes: [
      { id: "rescale", label: "rescale rf ÷100", result: -0.0002, recommended: true },
      { id: "asis", label: "leave them as they are", result: -0.02 },
    ],
  });
  assert.deepEqual(outcomes.map((o) => o.id), ["rescale", "asis"]);
  assert.equal(outcomes[0].recommended, true);
  assert.equal(outcomes[1].recommended, false);
});

test("the spread between outcomes is the size of the mistake being avoided", () => {
  const spread = unitSpread({
    outcomes: [{ id: "a", result: -0.0002 }, { id: "b", result: -0.02 }],
  });
  assert.equal(spread, 100);
});

test("a single outcome has no spread to report", () => {
  assert.equal(unitSpread({ outcomes: [{ id: "a", result: 1 }] }), null);
  assert.equal(unitSpread(null), null);
});

test("small and huge numbers stay readable", () => {
  assert.equal(formatResult(-0.0002), "-0.0002");
  assert.equal(formatResult(-0.02), "-0.02");
  assert.equal(formatResult(311165.6482), "311166");
  assert.equal(formatResult(0.0000004), "4.00e-7");
  assert.equal(formatResult("not a number"), "not computed");
});

test("an uncomputed outcome says so rather than showing zero", () => {
  const [outcome] = unitOutcomes({ outcomes: [{ id: "a", label: "x", result: null }] });
  assert.equal(outcome.resultLabel, "not computed");
});

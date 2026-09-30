import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentGapText, assessmentLabel } from "./assessmentLabels.js";

test("a question without requirement dimensions reads as needing a brief", () => {
  const result = { assessment_status: "insufficient_requirement", verdict: "not_covered", gap: { statement: "No assessable requirement dimension was supplied." } };
  assert.equal(assessmentLabel(result), "Needs a brief");
  assert.match(assessmentGapText(result), /period, frequency, or instruments/);
});

test("verdicts keep their labels and gap statements", () => {
  const result = { verdict: "partially_covered", gap: { statement: "Weekly grain missing." } };
  assert.equal(assessmentLabel(result), "Partially covered");
  assert.equal(assessmentGapText(result), "Weekly grain missing.");
  assert.equal(assessmentLabel({}), "Coverage assessment");
});

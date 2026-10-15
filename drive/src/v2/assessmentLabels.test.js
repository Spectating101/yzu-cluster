import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentGapText, assessmentLabel, judgedLibraryMatch } from "./assessmentLabels.js";

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

test("a verdict the research assistant judged is labelled as likely", () => {
  assert.equal(assessmentLabel({ assessment_status: "assessed", verdict: "covered", verdict_basis: "model_judgement" }), "Likely covered");
  assert.equal(assessmentLabel({ assessment_status: "assessed", verdict: "partially_covered", verdict_basis: "model_judgement" }), "Likely partly covered");
  assert.equal(assessmentLabel({ assessment_status: "assessed", verdict: "covered", verdict_basis: "declared_coverage" }), "Covered");
});

test("the judged Library match prefers a covering dataset over a partial one", () => {
  const held = [
    { dataset_id: "a", judgement: "partial" },
    { dataset_id: "b", judgement: "covers" },
    { dataset_id: "c" },
  ];
  assert.equal(judgedLibraryMatch({ held_evidence: held }).dataset_id, "b");
  assert.equal(judgedLibraryMatch({ held_evidence: [{ dataset_id: "c" }] }), null);
});

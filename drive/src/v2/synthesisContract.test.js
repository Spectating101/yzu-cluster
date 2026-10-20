import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_STATE, FIELDS, validateThreadState, contractCoverage } from "./synthesisContract.js";

// Every payload below is copied from e2e/v2-synthesis.spec.js, where a browser
// test proves the panel renders it. The contract is only worth anything if it
// accepts exactly what the UI is proven to accept.
const RENDERED = {
  scope_block: { rows: 1043042, limit: 1000000,
    options: [{ id: "2020", from: "2020-01-01", rows: 969392 },
              { id: "2023", from: "2023-01-01", rows: 506163 }] },
  unit_conflict: {
    left: { column: "return_1d", typical: 0.0006 },
    right: { column: "rf", typical: 0.012 },
    outcomes: [{ id: "rescale", label: "rescale rf ÷100", result: -0.0002, recommended: true },
               { id: "asis", label: "leave them as they are", result: -0.02 }] },
  column_profiles: [
    { column: "date", kind: "date", rows: 100, blanks: 0, distinct: 90, flags: [] },
    { column: "fwd_5d", kind: "measurement", rows: 100, blanks: 0, distinct: 90, flags: ["lookahead"] }],
  columns_in_use: ["date", "return_1d"],
  join_candidates: [
    { left_key: "yahoo_symbol", right_key: "yahoo_symbol", matched: 50, left_distinct: 635,
      match_rate_pct: 7.874, right_duplicate_rows: 0, usable: true, reason: null },
    { left_key: "yahoo_symbol", right_key: "isin", matched: 0, left_distinct: 635,
      match_rate_pct: 0, right_duplicate_rows: 0, usable: false,
      reason: "the column is empty on the right side" }],
  settled_decisions: [
    { id: "grain", authority: "observed", summary: "target grain asset × week" },
    { id: "asof", authority: "desk", summary: "as-of backward 5D", evidence: "100.0% matched" }],
  excursions: [{ id: "e1", at: "2026-08-18", searched: "regulatory filings", found: 1,
                 verdict: "grain incompatible" }],
  provenance: { method_hash: "sha256:dd997b185c521d70e38557b", built_at: "2026-08-18 19:43 UTC",
    job_id: "job-synthesis-42", archive_verified: true,
    inputs: [{ dataset_id: "idn_fry_daily_cross_section", fingerprint: "aa312a7412", files: 1, bytes: 35388 }],
    code_excerpt: "frame = pd.merge_asof(frame, ff, on='date', direction='backward')" },
  reuse_from: { method_hash: "sha256:dd997b185c521d70", output_dataset_id: "idn_weekly_factor_exposure",
    decisions: [{ id: "grain", authority: "observed", summary: "asset × week" }] },
  reuse_changes: [{ id: "metrics", label: "metrics", before: "5 defined", after: "7 defined" }],
};

test("the contract accepts every payload the browser tests render", () => {
  assert.deepEqual(validateThreadState(RENDERED), []);
});

test("each field is accepted on its own, as the desk will emit them", () => {
  for (const [field, value] of Object.entries(RENDERED)) {
    assert.deepEqual(validateThreadState({ [field]: value }), [], `${field} alone`);
  }
});

test("a thread carrying none of the fields is valid and renders no panel", () => {
  assert.deepEqual(validateThreadState({}), []);
  assert.deepEqual(contractCoverage({}).panels, []);
});

test("every field names the panel it feeds and where it comes from", () => {
  for (const [field, spec] of Object.entries(FIELDS)) {
    assert.match(spec.panel, /^synthesis-/, field);
    assert.ok(spec.produces.length > 10, field);
  }
});

test("a match rate sent as a fraction is still structurally valid, so the note must carry it", () => {
  assert.deepEqual(validateThreadState({ join_candidates: [{ ...RENDERED.join_candidates[0], match_rate_pct: 0.0787 }] }), []);
  assert.match(FIELDS.join_candidates.check.toString(), /percentage, not a fraction/);
});

test("an unusable join candidate must say why", () => {
  const problems = validateThreadState({
    join_candidates: [{ left_key: "a", right_key: "b", matched: 0, left_distinct: 1,
                        match_rate_pct: 0, right_duplicate_rows: 0, usable: false }] });
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /why it is unusable/);
});

test("authority must distinguish what the data settled from what the desk chose", () => {
  const problems = validateThreadState({ settled_decisions: [{ id: "x", authority: "system", summary: "s" }] });
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /observed.*desk/);
});

test("two recommended unit outcomes is a contradiction", () => {
  const conflict = { ...RENDERED.unit_conflict,
    outcomes: RENDERED.unit_conflict.outcomes.map((o) => ({ ...o, recommended: true })) };
  const problems = validateThreadState({ unit_conflict: conflict });
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /at most one/);
});

test("a measured pre-method unit conflict may remain explicitly uncomputed", () => {
  const conflict = {
    left: { column: "return_1d", typical: 0.0006 },
    right: { column: "return_pct", typical: 0.06 },
    outcomes: [
      { id: "as_is", label: "Combine as recorded", result: null, recommended: false },
      { id: "rescale", label: "Rescale by 100x first", result: null, recommended: false },
    ],
    undecided_because: "documentation must settle which series is correctly scaled",
  };
  assert.deepEqual(validateThreadState({ unit_conflict: conflict }), []);
});

test("a reuse change must carry before and after even when they are equal", () => {
  const problems = validateThreadState({ reuse_changes: [{ id: "scope", label: "scope", before: "2020-01-01" }] });
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /after must be present/);
});

test("scope options must say what each cut leaves", () => {
  const problems = validateThreadState({ scope_block: { rows: 5, limit: 1, options: [{ id: "a", from: "2020-01-01" }] } });
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /rows must be the row count that cut leaves/);
});

test("a problem names the field and the panel it breaks", () => {
  const [problem] = validateThreadState({ provenance: { inputs: [] } });
  assert.equal(problem.field, "provenance");
  assert.equal(problem.panel, "synthesis-provenance");
});

test("coverage reports what a real thread would light up", () => {
  const coverage = contractCoverage(RENDERED);
  assert.equal(coverage.absent.length, 0);
  assert.equal(coverage.present.length, Object.keys(FIELDS).length);
  assert.ok(coverage.panels.includes("synthesis-scope-block"));
});

test("the shipped example is exactly what the browser tests render", () => {
  assert.deepEqual(EXAMPLE_STATE, RENDERED);
  assert.deepEqual(validateThreadState(EXAMPLE_STATE), []);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  coverageVerdict,
  collapseChoices,
  joinOutcomes,
  needsCollapse,
  rankCandidates,
} from "./joinCandidates.js";

const row = (over = {}) => ({
  left_key: "sym", right_key: "sym", matched: 50, left_distinct: 635,
  match_rate_pct: 7.874, right_duplicate_rows: 0, usable: true, reason: null, ...over,
});

test("candidates are ranked by coverage, best first", () => {
  const ranked = rankCandidates([
    row({ right_key: "isin", match_rate_pct: 0, usable: false }),
    row({ right_key: "ric", match_rate_pct: 7.874 }),
    row({ right_key: "good", match_rate_pct: 99.8 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.rightKey), ["good", "ric", "isin"]);
});

test("a complete entity-period key outranks a higher-coverage partial identity key", () => {
  const ranked = rankCandidates([
    row({
      left_key: "entity_id",
      right_key: "entity_id",
      key_parts: ["entity_id"],
      complete_identity_domain: false,
      matched: 100,
      left_distinct: 100,
      match_rate_pct: 100,
    }),
    row({
      left_key: "entity_id + week",
      right_key: "entity_id + week",
      key_parts: ["entity_id", "week"],
      complete_identity_domain: true,
      left_dataset_id: "left_panel",
      right_dataset_id: "right_panel",
      left_label: "Issuer-week research panel",
      right_label: "Weekly market evidence",
      matched: 50,
      left_distinct: 100,
      match_rate_pct: 50,
    }),
  ]);

  assert.equal(ranked[0].leftKey, "entity_id + week");
  assert.deepEqual(ranked[0].keyParts, ["entity_id", "week"]);
  assert.equal(ranked[0].coverage, 50);
  assert.equal(ranked[0].leftLabel, "Issuer-week research panel");
  assert.equal(ranked[0].rightLabel, "Weekly market evidence");
  assert.equal(ranked[1].coverage, 100);
});

test("coverage decides the verdict, not duplication", () => {
  assert.equal(coverageVerdict(rankCandidates([row({ match_rate_pct: 99.8 })])[0]), "strong");
  assert.equal(coverageVerdict(rankCandidates([row({ match_rate_pct: 70 })])[0]), "partial");
  assert.equal(coverageVerdict(rankCandidates([row({ match_rate_pct: 7.874 })])[0]), "weak");
  assert.equal(coverageVerdict(rankCandidates([row({ usable: false })])[0]), "unusable");
});

test("a weak join recommends skipping and says why", () => {
  const [candidate] = rankCandidates([row()]);
  const outcomes = joinOutcomes(candidate);
  const skip = outcomes.find((o) => o.id === "skip");
  assert.equal(skip.recommended, true);
  assert.match(skip.consequence, /costs more than it adds/);
});

test("a weak inner join is described as a different population, not a smaller one", () => {
  const [candidate] = rankCandidates([row()]);
  const inner = joinOutcomes(candidate).find((o) => o.id === "inner");
  assert.equal(inner.recommended, false);
  assert.match(inner.consequence, /different population/);
});

test("a strong join recommends the inner join", () => {
  const [candidate] = rankCandidates([row({ matched: 634, left_distinct: 635, match_rate_pct: 99.8 })]);
  const outcomes = joinOutcomes(candidate);
  assert.equal(outcomes.find((o) => o.id === "inner").recommended, true);
  assert.equal(outcomes.find((o) => o.id === "skip").recommended, false);
});

test("a left join states the share the metric would actually be computed on", () => {
  const [candidate] = rankCandidates([row()]);
  const left = joinOutcomes(candidate).find((o) => o.id === "left");
  assert.match(left.consequence, /585 carry blanks/);
  assert.match(left.consequence, /8% of rows/);
});

test("no duplicate keys means no collapse question is asked", () => {
  const [candidate] = rankCandidates([row({ right_duplicate_rows: 0 })]);
  assert.equal(needsCollapse(candidate), false);
  assert.deepEqual(collapseChoices(candidate), []);
});

test("duplicate keys offer refusal first", () => {
  const [candidate] = rankCandidates([row({ right_duplicate_rows: 4 })]);
  assert.equal(needsCollapse(candidate), true);
  const choices = collapseChoices(candidate);
  assert.deepEqual(choices.map((c) => c.id), ["error", "first", "last"]);
  assert.equal(choices[0].recommended, true);
  assert.match(choices[1].detail, /4 extra right rows/);
});

test("an empty right column is unusable and recommends skipping", () => {
  const [candidate] = rankCandidates([
    row({ right_key: "isin", usable: false, matched: 0, match_rate_pct: 0,
          reason: "the column is empty on the right side" }),
  ]);
  assert.equal(coverageVerdict(candidate), "unusable");
  assert.equal(candidate.reason, "the column is empty on the right side");
  assert.equal(joinOutcomes(candidate).find((o) => o.id === "skip").recommended, true);
});

test("an empty candidate list does not throw", () => {
  assert.deepEqual(rankCandidates(null), []);
  assert.equal(coverageVerdict(undefined), "unusable");
});

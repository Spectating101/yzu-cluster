import test from "node:test";
import assert from "node:assert/strict";

import {
  contestableCount,
  excursionEntries,
  excursionSummary,
  reuseDiff,
  settledDecisions,
  shortHash,
} from "./threadRecord.js";

const DECISIONS = [
  { id: "grain", authority: "observed", summary: "target grain asset × week", evidence: "from the input's keys" },
  { id: "asof", authority: "desk", summary: "as-of backward 5D", evidence: "100.0% matched, no lookahead" },
  { id: "scope", authority: "researcher", summary: "from 2020-01-01", evidence: "−7.1%" },
];

test("every decision carries who made it", () => {
  const decisions = settledDecisions(DECISIONS);
  assert.deepEqual(decisions.map((d) => d.authorityLabel),
    ["observed", "the desk chose", "you chose"]);
});

test("what the data established is not contestable; the rest is", () => {
  const decisions = settledDecisions(DECISIONS);
  assert.equal(decisions.find((d) => d.id === "grain").contestable, false);
  assert.equal(decisions.find((d) => d.id === "asof").contestable, true);
  assert.equal(contestableCount(decisions), 2);
});

test("an unknown authority is treated as a desk choice, so it stays reversible", () => {
  const [decision] = settledDecisions([{ id: "x", authority: "mystery", summary: "s" }]);
  assert.equal(decision.authority, "mystery");
  assert.equal(decision.contestable, true);
});

test("a desk choice says it was resolved for you and can be undone", () => {
  const [, desk] = settledDecisions(DECISIONS);
  assert.equal(desk.note, "resolved for you, and reversible");
});

test("an excursion that found nothing is still a result", () => {
  const [entry] = excursionEntries([
    { at: "2026-08-18", searched: "regulatory filings", found: 0 },
  ]);
  assert.equal(entry.verdict, "nothing found");
  assert.equal(entry.found, 0);
});

test("an excursion keeps the verdict the desk gave it", () => {
  const [entry] = excursionEntries([
    { at: "2026-08-18", searched: "regulatory filings", found: 1, verdict: "grain incompatible" },
  ]);
  assert.equal(entry.verdict, "grain incompatible");
});

test("the summary says how many trips are still open", () => {
  const entries = excursionEntries([
    { searched: "a", found: 1, resolved: true },
    { searched: "b", found: 0 },
  ]);
  assert.equal(excursionSummary(entries), "2 searched · 1 still open");
});

test("no excursions produces no summary line at all", () => {
  assert.equal(excursionSummary(excursionEntries([])), "");
});

test("a revision carries the decisions it does not change", () => {
  const diff = reuseDiff(
    { method_hash: "sha256:dd997b185c521d70", decisions: DECISIONS },
    [
      { id: "metrics", label: "metrics", before: "5 defined", after: "7 defined" },
      { id: "scope", label: "scope", before: "2020-01-01", after: "2020-01-01" },
    ],
  );
  assert.equal(diff.carried.length, 3);
  assert.deepEqual(diff.moved.map((m) => m.id), ["metrics"]);
  assert.deepEqual(diff.unchanged.map((m) => m.id), ["scope"]);
});

test("a revision never claims the prior version stopped being citable", () => {
  assert.equal(reuseDiff({ method_hash: "sha256:abc" }, []).citable, true);
});

test("a hash is shortened for reading but keeps its prefix", () => {
  assert.equal(shortHash("sha256:dd997b185c521d70e38557b"), "sha256:dd997b18…");
  assert.equal(shortHash("dd997b185c521d70"), "sha256:dd997b18…");
  assert.equal(shortHash(""), "");
});

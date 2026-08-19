import test from "node:test";
import assert from "node:assert/strict";

import { focusFor, hasExecuted, showsDraft } from "./synthesisFocus.js";

const scope = { rows: 1043042, limit: 1000000, options: [] };
const units = { left: { column: "return_1d", typical: 0.0006 }, right: { column: "rf", typical: 0.012 } };

test("a refusal outranks everything, because nothing downstream can be true yet", () => {
  const focus = focusFor({ scope_block: scope, unit_conflict: units, nodes: [{ id: "n" }] });
  assert.equal(focus.subject, "scope");
  assert.equal(focus.blocking, true);
});

test("the waiting state never shows beside a refusal", () => {
  assert.equal(showsDraft(focusFor({ scope_block: scope })), false);
  assert.equal(showsDraft(focusFor({})), true);
});

test("a decision outranks a report", () => {
  assert.equal(focusFor({ unit_conflict: units, nodes: [{ id: "n" }],
    column_profiles: [{ column: "a", flags: ["sparse"] }] }).subject, "units");
  assert.equal(focusFor({ proposal: { id: "p" }, nodes: [{ id: "n" }] }).subject, "proposal");
});

test("a failure outranks a proposal, because the proposal cannot be acted on", () => {
  assert.equal(focusFor({ proposal: { id: "p" }, execution: { status: "failed" } }).subject, "failed");
});

test("everything else with something to say becomes one line", () => {
  const focus = focusFor({
    scope_block: scope,
    column_profiles: [{ column: "a", flags: [] }, { column: "fwd_1d", flags: ["lookahead"] }],
    columns_in_use: ["a"],
    excursions: [{ id: "e" }],
  });
  assert.deepEqual(focus.strip.map((s) => s.id), ["columns", "excursions"]);
  assert.equal(focus.strip[0].summary, "1 of 2 in use · 1 resolved");
});

test("the subject never repeats itself in the strip", () => {
  const focus = focusFor({ scope_block: scope });
  assert.equal(focus.strip.find((s) => s.id === "scope"), undefined);
});

test("a strip line with nothing to say is dropped, not shown empty", () => {
  const focus = focusFor({ nodes: [{ id: "n" }] });
  assert.deepEqual(focus.strip, []);
});

test("the researcher can promote a strip line to the subject", () => {
  const state = { scope_block: scope, excursions: [{ id: "e" }],
                  join_candidates: [{ match_rate_pct: 7.9 }] };
  const focus = focusFor(state, "join");
  assert.equal(focus.subject, "join");
  assert.equal(focus.promoted, true);
  assert.equal(focus.natural, "scope");
  assert.ok(focus.strip.some((s) => s.id === "scope"));
});

test("promoting something the state cannot support falls back to the natural subject", () => {
  const focus = focusFor({ scope_block: scope }, "provenance");
  assert.equal(focus.subject, "scope");
  assert.equal(focus.promoted, false);
});

test("an empty thread is interpreting, not an error", () => {
  const focus = focusFor(null);
  assert.equal(focus.subject, "draft");
  assert.deepEqual(focus.strip, []);
});


// A refusal that happened before a build cannot still be true after one. Ranking
// by severity alone made a finished, registered construction render CANNOT BUILD.

const registered = { execution: { status: "registered" }, nodes: [{ id: "n" }] };

test("a registered thread ignores a scope block it has outlived", () => {
  const focus = focusFor({ ...registered, scope_block: scope });
  assert.equal(focus.subject, "ready");
  assert.equal(focus.blocking, false);
});

test("the same is true of units and of join coverage", () => {
  assert.equal(focusFor({ ...registered, unit_conflict: units }).subject, "ready");
  assert.equal(focusFor({ ...registered, join_candidates: [{ match_rate_pct: 7.9 }] }).subject, "ready");
});

test("a stale field does not linger in the strip either", () => {
  const focus = focusFor({ ...registered, scope_block: scope, join_candidates: [{ match_rate_pct: 7.9 }] });
  assert.equal(focus.strip.find((s) => s.id === "scope"), undefined);
  assert.equal(focus.strip.find((s) => s.id === "join"), undefined);
});

test("a build in flight also outranks a pre-build refusal", () => {
  const focus = focusFor({ execution: { status: "running" }, scope_block: scope });
  assert.equal(focus.subject, "building");
});

test("a failure still outranks everything, including a stale refusal", () => {
  const focus = focusFor({ execution: { status: "failed" }, scope_block: scope });
  assert.equal(focus.subject, "failed");
});

test("a proposal survives a build, because a revision starts as one", () => {
  const focus = focusFor({ ...registered, proposal: { id: "p" } });
  assert.equal(focus.subject, "proposal");
});

test("before any build, a refusal still wins", () => {
  assert.equal(focusFor({ scope_block: scope, nodes: [{ id: "n" }] }).subject, "scope");
  assert.equal(hasExecuted({ scope_block: scope }), false);
});

test("promoting a stale subject is refused rather than honoured", () => {
  const focus = focusFor({ ...registered, scope_block: scope }, "scope");
  assert.equal(focus.subject, "ready");
  assert.equal(focus.promoted, false);
});

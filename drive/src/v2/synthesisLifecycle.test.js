import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStageDetail,
  executionTrack,
  synthesisShowsEvidenceMap,
  synthesisShowsStageStrip,
} from "./synthesisLifecycle.js";

const row = (track, label) => track.find((entry) => entry.label === label);

/* ── Build stage: a specification is not approval ─────────────────────── */

test("an accepted specification without approval is not called approved", () => {
  const thread = { state: { execution_spec: { input_dataset_id: "a", output_dataset_id: "b" } } };
  assert.equal(buildStageDetail(thread), "Execution specified");
});

test("pending approval asks for a decision instead of claiming approval", () => {
  const thread = {
    state: {
      execution_spec: { input_dataset_id: "a", output_dataset_id: "b" },
      execution: { status: "pending_approval" },
    },
  };
  assert.equal(buildStageDetail(thread), "Approval required");
});

test("only post-approval lifecycle states describe execution as approved", () => {
  for (const status of ["queued", "running", "registering", "archiving", "registered", "query_ready", "completed"]) {
    const thread = { state: { execution_spec: { output_dataset_id: "b" }, execution: { status } } };
    assert.equal(buildStageDetail(thread), "Approved execution", `status ${status}`);
  }
});

test("a thread with no specification makes no execution claim", () => {
  assert.equal(buildStageDetail({ state: {} }), "Execution record");
  assert.equal(buildStageDetail(undefined), "Execution record");
});

test("numbered construction stages stay hidden until a method is accepted", () => {
  assert.equal(synthesisShowsStageStrip({ state: {} }), false);
  assert.equal(synthesisShowsStageStrip({ state: { nodes: [{ type: "source" }] } }), false);
  assert.equal(synthesisShowsStageStrip({ state: { proposal: { id: "proposal_1" } } }), false);
  assert.equal(synthesisShowsStageStrip({ state: { execution_spec: { output_dataset_id: "output" } } }), true);
  assert.equal(synthesisShowsStageStrip({ state: { execution: { status: "registered" } } }), true);
});

/* ── Execution track: completed != archived != registered != query-ready ─ */

test("completed worker leaves archive and registry unverified", () => {
  const track = executionTrack("completed", false, false);
  assert.equal(row(track, "Worker build").detail, "Completed");
  assert.equal(row(track, "Archive + registry").detail, "Awaiting verification");
  assert.notEqual(row(track, "Archive + registry").state, "done");
  assert.equal(row(track, "Library handoff").detail, "Not registered");
});

test("pending approval does not advance the worker or archive rows", () => {
  const track = executionTrack("pending_approval", false, false);
  assert.equal(row(track, "Researcher approval").detail, "Decision required");
  assert.equal(row(track, "Worker build").detail, "Waiting");
  assert.equal(row(track, "Archive + registry").detail, "Waiting");
});

test("registered verifies archive but does not imply query readiness", () => {
  const track = executionTrack("registered", true, false);
  assert.equal(row(track, "Archive + registry").detail, "Verified");
  assert.equal(row(track, "Archive + registry").state, "done");
  assert.equal(row(track, "Library handoff").detail, "Registered · query readiness unverified");
});

test("query readiness requires the explicit query_ready lifecycle", () => {
  const track = executionTrack("query_ready", true, true);
  assert.equal(row(track, "Archive + registry").detail, "Verified");
  assert.equal(row(track, "Library handoff").detail, "Query-ready asset");
});

test("an unrequested execution claims nothing", () => {
  const track = executionTrack("", false, false);
  assert.equal(row(track, "Researcher approval").detail, "Not requested");
  assert.equal(row(track, "Worker build").detail, "Waiting");
  assert.equal(row(track, "Archive + registry").detail, "Waiting");
  assert.equal(row(track, "Library handoff").detail, "Not registered");
});

test("hyphenated and mixed-case statuses normalize", () => {
  const track = executionTrack("Query-Ready", true, true);
  assert.equal(row(track, "Archive + registry").detail, "Verified");
});

test("registered threads still show the evidence map when nodes exist", () => {
  assert.equal(
    synthesisShowsEvidenceMap({
      state: {
        execution: { status: "registered", output_dataset_id: "synthesis_keeling_accel_monthly_v1" },
        nodes: [{ type: "source", label: "Mauna Loa Monthly CO₂", dataset_id: "keeling_mlo_monthly_clean" }],
      },
    }),
    true,
  );
});

test("registered threads without mapped nodes do not invent an evidence map", () => {
  assert.equal(
    synthesisShowsEvidenceMap({
      state: { execution: { status: "registered" }, nodes: [] },
    }),
    false,
  );
});

test("draft threads with no evidence nodes stay off the map", () => {
  assert.equal(synthesisShowsEvidenceMap({ state: {} }), false);
  assert.equal(synthesisShowsEvidenceMap(undefined), false);
});

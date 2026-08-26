import assert from "node:assert/strict";
import test from "node:test";

import { executionTrack } from "./synthesisLifecycle.js";

/**
 * The worker-build step marked "failed" with the same "now" state as queued and
 * running, so a run that had stopped was styled as the step currently in
 * progress. The detail text said Failed while the marker said in-flight.
 */
const build = (status) => executionTrack(status, false, false).find((s) => s.label === "Worker build");

test("a failed build is not styled as the running step", () => {
  assert.notEqual(build("failed").state, build("running").state);
  assert.notEqual(build("failed").state, build("queued").state);
});

test("a failed build carries a failed state", () => {
  assert.equal(build("failed").state, "failed");
  assert.equal(build("failed").detail, "Failed");
});

test("running and queued keep the in-progress marker", () => {
  assert.equal(build("running").state, "now");
  assert.equal(build("queued").state, "now");
});

test("a completed build is still done", () => {
  for (const s of ["registering", "archiving", "registered", "query_ready", "completed"]) {
    assert.equal(build(s).state, "done", `${s} lost its done marker`);
  }
});

test("failure does not falsely advance later stages", () => {
  const track = executionTrack("failed", false, false);
  const archive = track.find((s) => s.label === "Archive + registry");
  const handoff = track.find((s) => s.label === "Library handoff");
  assert.equal(archive.state, "");
  assert.equal(handoff.state, "");
});

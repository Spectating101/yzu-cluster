import test from "node:test";
import assert from "node:assert/strict";
import { buildPickUp } from "./homeIteration10.js";

const DATASET = { dataset_id: "library-a", name: "Library A", analysis_readiness: "instant" };
const PROPOSAL = {
  id: "thread-proposal",
  updated_at: "2026-08-27T12:00:00Z",
  title: "Proposal construction",
  state: {
    title: "Proposal construction",
    nodes: [{ id: "evidence", type: "source", layer: "evidence", dataset_id: "library-a" }],
    proposal: { id: "proposal-v1", proposal_hash: "sha256:v1" },
    execution_spec: null,
    execution: null,
  },
};

test("reviewable Synthesis outranks passive Library recency", () => {
  const { primary, secondary } = buildPickUp({
    datasets: [DATASET],
    jobs: [],
    health: { desk: { jobs: { pending_approval: 0 } } },
    synthesisThreads: [PROPOSAL],
  });
  assert.equal(primary.kind, "synthesis_thread");
  assert.equal(primary.id, "thread-proposal");
  assert.match(primary.location, /SYNTHESIS \/ PROPOSAL REVIEW/);
  assert.equal(secondary.kind, "library_asset");
});

test("explicit researcher decision outranks Synthesis", () => {
  const { primary, secondary } = buildPickUp({
    datasets: [DATASET],
    jobs: [{ id: "job-1", status: "pending_approval", plan: { title: "MOPS collection" } }],
    health: { desk: { jobs: { pending_approval: 1 } } },
    synthesisThreads: [PROPOSAL],
  });
  assert.equal(primary.kind, "decision");
  assert.equal(primary.action, "review");
  assert.equal(secondary.kind, "synthesis_thread");
});

test("failed Synthesis is recovery work and registered Synthesis is not resumable", () => {
  const failed = {
    ...structuredClone(PROPOSAL),
    id: "thread-failed",
    title: "Failed construction",
    state: { ...structuredClone(PROPOSAL.state), proposal: null, execution_spec: { output_dataset_id: "x" }, execution: { status: "failed" } },
  };
  const registered = {
    ...structuredClone(PROPOSAL),
    id: "thread-registered",
    state: { ...structuredClone(PROPOSAL.state), execution: { status: "registered" } },
  };
  const { primary } = buildPickUp({
    datasets: [DATASET],
    jobs: [],
    health: { desk: { jobs: { pending_approval: 0 } } },
    synthesisThreads: [registered, failed],
  });
  assert.equal(primary.id, "thread-failed");
  assert.equal(primary.warn, true);
  assert.match(primary.pill, /recovery/i);
});

test("Discover recovery outranks Library when no Synthesis needs attention", () => {
  const { primary } = buildPickUp({
    datasets: [DATASET],
    jobs: [{ id: "job-failed", status: "failed", title: "Acquire source" }],
    health: { desk: { jobs: { pending_approval: 0 } } },
    synthesisThreads: [],
  });
  assert.equal(primary.kind, "discover_work");
  assert.equal(primary.action, "review");
  assert.equal(primary.warn, true);
});

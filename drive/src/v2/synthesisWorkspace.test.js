import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_SYNTHESIS_PROJECT,
  applyProjectProposal,
  applySynthesisPatch,
  rejectProjectProposal,
} from "./synthesisWorkspace.js";

test("applying the GDELT proposal changes evidence role and edge semantics", () => {
  const next = applyProjectProposal(ATTENTION_SYNTHESIS_PROJECT);
  const gdelt = next.nodes.find((node) => node.id === "gdelt");
  const edge = next.edges.find((item) => item.id === "gdelt-output");
  assert.equal(gdelt.status, "queryable");
  assert.equal(gdelt.role, "Validation signal");
  assert.equal(edge.relation, "validates");
  assert.deepEqual(next.spec.validation, [["GDELT", "News coverage · external validation"]]);
  assert.deepEqual(gdelt.progress, ["Indexed", "Capability known", "Query design pending"]);
  assert.equal(next.proposal, null);
});

test("rejecting a source proposal removes the candidate and connected edges", () => {
  const next = rejectProjectProposal(ATTENTION_SYNTHESIS_PROJECT);
  assert.equal(next.nodes.some((node) => node.id === "gdelt"), false);
  assert.equal(next.edges.some((edge) => edge.source === "gdelt" || edge.target === "gdelt"), false);
  assert.equal(next.proposal, null);
});

test("unsupported synthesis patch operations are rejected", () => {
  assert.throws(
    () => applySynthesisPatch(ATTENTION_SYNTHESIS_PROJECT, [{ op: "materialise_without_execution" }]),
    /Unsupported synthesis patch operation/,
  );
});

test("new synthesis edges require existing endpoints", () => {
  assert.throws(
    () => applySynthesisPatch(ATTENTION_SYNTHESIS_PROJECT, [{
      op: "add_edge",
      edge: { id: "bad-edge", source: "missing-a", target: "missing-b" },
    }]),
    /endpoints must exist/,
  );
});

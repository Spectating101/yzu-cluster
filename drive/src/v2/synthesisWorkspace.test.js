import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENTION_SYNTHESIS_PROJECT,
  applyProjectProposal,
  applySynthesisPatch,
  constructionStateFromProject,
  discoverQueryFromHandoff,
  emptyConstructionProject,
  findAttentionSynthesisThread,
  isUnformedSynthesisProject,
  projectFromSynthesisThread,
  rejectProjectProposal,
  synthesisGroundingPrompt,
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

test("construction state round-trips through a durable thread payload", () => {
  const state = constructionStateFromProject(ATTENTION_SYNTHESIS_PROJECT);
  assert.equal(state.projectKey, ATTENTION_SYNTHESIS_PROJECT.id);
  assert.equal(state.proposal.id, "gdelt-validation");
  const hydrated = projectFromSynthesisThread(
    {
      id: "thread-attention-1",
      title: ATTENTION_SYNTHESIS_PROJECT.title,
      objective: ATTENTION_SYNTHESIS_PROJECT.objective,
      materialisation: "not_materialised",
      state,
    },
    ATTENTION_SYNTHESIS_PROJECT,
  );
  assert.equal(hydrated.id, ATTENTION_SYNTHESIS_PROJECT.id);
  assert.equal(hydrated.threadId, "thread-attention-1");
  assert.equal(hydrated.proposal.id, "gdelt-validation");
  assert.equal(hydrated.nodes.find((node) => node.id === "x_followers").status, "missing");
});

test("hydrated synthesis projects preserve linked chat session identity", () => {
  const state = constructionStateFromProject(ATTENTION_SYNTHESIS_PROJECT);
  const hydrated = projectFromSynthesisThread(
    {
      id: "thread-linked-1",
      title: ATTENTION_SYNTHESIS_PROJECT.title,
      objective: ATTENTION_SYNTHESIS_PROJECT.objective,
      materialisation: "not_materialised",
      session_id: "sess-continuity-1",
      conversation_id: "conv-continuity-1",
      state,
    },
    ATTENTION_SYNTHESIS_PROJECT,
  );
  assert.equal(hydrated.threadId, "thread-linked-1");
  assert.equal(hydrated.sessionId, "sess-continuity-1");
  assert.equal(hydrated.conversationId, "conv-continuity-1");
});

test("accepted thread state clears the proposal on hydrate", () => {
  const accepted = applyProjectProposal(ATTENTION_SYNTHESIS_PROJECT);
  const hydrated = projectFromSynthesisThread(
    {
      id: "thread-accepted",
      title: accepted.title,
      objective: accepted.objective,
      materialisation: "not_materialised",
      state: constructionStateFromProject(accepted),
    },
    ATTENTION_SYNTHESIS_PROJECT,
  );
  assert.equal(hydrated.proposal, null);
  assert.equal(hydrated.nodes.find((node) => node.id === "gdelt").status, "queryable");
  assert.equal(findAttentionSynthesisThread([{
    id: "thread-accepted",
    title: ATTENTION_SYNTHESIS_PROJECT.title,
    state: { projectKey: ATTENTION_SYNTHESIS_PROJECT.id },
  }])?.id, "thread-accepted");
  assert.equal(
    findAttentionSynthesisThread([{
      id: "title-only-match",
      title: ATTENTION_SYNTHESIS_PROJECT.title,
      state: {},
    }]),
    null,
  );
});

test("discover handoff query prefers missing evidence identity", () => {
  assert.equal(
    discoverQueryFromHandoff({
      objective: "Construct attention",
      missing_evidence: [{ id: "x_followers", label: "Historical X follower growth" }],
    }),
    "Historical X follower growth",
  );
});

test("empty construction projects are honest working briefs", () => {
  const draft = emptyConstructionProject({
    projectKey: "synth_custom_1",
    objective: "Build a weekly FX stress proxy from held FX and news panels.",
  });
  const state = constructionStateFromProject(draft);
  assert.equal(state.projectKey, "synth_custom_1");
  assert.equal(state.materialisation, "not_materialised");
  assert.deepEqual(state.nodes, []);
  assert.deepEqual(state.edges, []);
  assert.equal(state.unformed, true);
  assert.equal(isUnformedSynthesisProject(draft), true);
  assert.equal(isUnformedSynthesisProject(ATTENTION_SYNTHESIS_PROJECT), false);
});

test("custom thread hydrate keeps projectKey identity and never borrows seed evidence", () => {
  const draft = emptyConstructionProject({
    projectKey: "synth_custom_2",
    objective: "Reconstruct issuer-week liquidity stress for Asian ADRs.",
    title: "Historical stablecoin attention",
  });
  const hydrated = projectFromSynthesisThread(
    {
      id: "thread-custom-2",
      title: "Historical stablecoin attention",
      objective: draft.objective,
      materialisation: "not_materialised",
      state: constructionStateFromProject(draft),
    },
    ATTENTION_SYNTHESIS_PROJECT,
  );
  assert.equal(hydrated.id, "synth_custom_2");
  assert.equal(hydrated.threadId, "thread-custom-2");
  assert.equal(hydrated.nodes.length, 0);
  assert.equal(hydrated.edges.length, 0);
  assert.equal(hydrated.materialisation, "not_materialised");
  assert.equal(hydrated.nodes.some((node) => node.id === "gdelt" || node.id === "trends"), false);
  assert.equal(isUnformedSynthesisProject(hydrated), true);
  const grounding = synthesisGroundingPrompt(hydrated);
  assert.match(grounding.prompt, /Reconstruct issuer-week liquidity stress/);
  assert.match(grounding.prompt, /Do not invent evidence/);
});

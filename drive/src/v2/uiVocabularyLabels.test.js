import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { synthesisAssist, synthesisAssistRequestContext, synthesisExecutionLabel } from "./synthesisAssist.js";
import { synthesisDraftPrompt } from "./synthesisDraft.js";
import { proposalFromDiscoverCandidate } from "./discoverIntent.js";
import { collectionStatusLabel } from "./procurementJobs.js";
import { synthesisObjectiveDisplay, uiVocabularyLabel } from "./uiVocabularyLabels.js";
import { enrichSynthesisObjectContext, synthesisObjectContextPrompt, synthesisObjectKindLabel } from "./synthesisObjectContext.js";

describe("display vocabulary and request wording", () => {
  it("separates a shown shortcut from the unchanged model prompt", () => {
    const assist = synthesisAssist({ state: {}, materialisation: "query_ready" });
    const prompt = "Explain the current construction and its authority state.";
    assert.equal(uiVocabularyLabel(prompt), "Explain the current build and how its status was verified.");
    assert.equal(prompt, "Explain the current construction and its authority state.");
    assert.ok(Array.isArray(assist.prompts));
    const draftPrompt = synthesisDraftPrompt();
    assert.match(draftPrompt, /unit or grain/);
    assert.equal(uiVocabularyLabel(draftPrompt), "Help me frame a research question, unit of observation, time horizon, and intended use before choosing data or a method.");
    const multilineDraft = synthesisDraftPrompt("Research purpose: compare firms\nPeriod: 2020–2025");
    assert.match(multilineDraft, /Unit \/ grain/);
    assert.equal(uiVocabularyLabel(multilineDraft), "Help me sharpen this research question before saving it.");
  });

  it("keeps researcher names intact in generated prompt display labels", () => {
    assert.equal(uiVocabularyLabel("Compare Search intent with my Library holdings"), "Compare Search intent with data in my Library");
    assert.equal(uiVocabularyLabel("Inspect asset × week in this construction."), "Inspect asset × week in this build.");
    assert.equal(uiVocabularyLabel("What should I probe next for Research construction?"), "Which connection should I test next for Research construction?");
    assert.equal(uiVocabularyLabel("What coverage would acquiring TWSE add beyond the local asset? Do not invent dimensions."), "What coverage would collecting TWSE add beyond the local dataset? Do not invent dimensions.");
  });

  it("does not rewrite arbitrary prose, identifiers, URLs, or enum values", () => {
    for (const value of ["My construction uses financial asset × week", "intent", "query_ready", "/library/discover/intents/123", "estimates and revisions"]) {
      assert.equal(uiVocabularyLabel(value), value);
    }
    assert.equal(uiVocabularyLabel(null), null);
  });

  it("labels legacy backend pills and activity without changing their stored text", () => {
    const event = Object.freeze({ text: "Validating bounded Preview receipt" });
    assert.equal(uiVocabularyLabel(event.text), "Checking the sample preview record");
    assert.equal(event.text, "Validating bounded Preview receipt");
    assert.equal(uiVocabularyLabel("Registered · unconfirmed"), "In Library · not yet checked");
    assert.equal(uiVocabularyLabel("Query-ready"), "Ready to query");
  });

  it("maps a proposal at display time while retaining the exact submitted values", () => {
    const proposal = proposalFromDiscoverCandidate({ connector_id: "twse", title: "TWSE" });
    assert.equal(proposal.summary, "Review the declared connector route for TWSE.");
    assert.equal(uiVocabularyLabel(proposal.summary), "Review the documented download method for TWSE.");
    assert.equal(proposal.routes[0].access, "Connector route declared; collection remains approval-gated.");
    assert.equal(uiVocabularyLabel(proposal.routes[0].access), "Download method known; collection still requires your approval.");
    const request = synthesisAssistRequestContext({ state: {}, ephemeral: true });
    assert.match(request.risk, /durable|construction/);
  });

  it("maps the generated blueprint input line without changing the saved objective", () => {
    const objective = "Blueprint: My build\nRegistered inputs: TWSE; Search intent\nLead question: Why?";
    assert.equal(synthesisObjectiveDisplay(objective), "Blueprint: My build\nInputs from Library: TWSE; Search intent\nLead question: Why?");
    assert.match(objective, /Registered inputs:/);
    assert.equal(synthesisObjectiveDisplay("My question mentions Registered inputs: TWSE"), "My question mentions Registered inputs: TWSE");
  });

  it("maps backend statuses without claiming a dataset is ready just because it is saved", () => {
    assert.equal(synthesisExecutionLabel("registered"), "Saved to Library");
    assert.equal(synthesisExecutionLabel("query_ready"), "Ready to query");
    assert.equal(synthesisExecutionLabel("spec_accepted"), "Method accepted");
    assert.equal(synthesisExecutionLabel("future_status"), "Execution status not described");
    assert.equal(collectionStatusLabel("proposal_ready"), "Proposal ready for review");
    assert.equal(collectionStatusLabel("route_selected"), "Collection method selected");
    assert.equal(collectionStatusLabel("future_status"), "Status not reported");
  });

  it("labels a selected object without changing its context prompt", () => {
    const context = enrichSynthesisObjectContext({ kind: "preview", thread_id: "t1" });
    assert.equal(context.label, "Bounded Preview");
    assert.equal(synthesisObjectKindLabel(context.kind), "Sample preview");
    assert.match(synthesisObjectContextPrompt(context), /Label: Bounded Preview\./);
    assert.equal(synthesisObjectKindLabel("method"), "Method design");
    assert.equal(synthesisObjectKindLabel("result"), "Result saved to Library");
    assert.equal(synthesisObjectKindLabel("new_internal_kind"), "Synthesis item");
  });
});

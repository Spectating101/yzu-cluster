import { facultyStateLabel, normalizeResearchState, RESEARCH_ACTIONS } from "./researchValue.js";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function first(...values) {
  return values.map((value) => text(value)).find(Boolean) || "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function evidenceNodes(thread) {
  return asArray(thread?.state?.nodes).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function isMissingNode(node) {
  return /missing|needs_access|sourceable|blocked|unknown/i.test(String(node?.status || node?.state || ""));
}

function targetNode(thread) {
  return asArray(thread?.state?.nodes).find((node) => node?.layer === "target" || node?.type === "target") || null;
}

function mappedDataset(node, datasets) {
  const id = node?.dataset_id || node?.id;
  return asArray(datasets).find((dataset) => dataset?.dataset_id === id) || null;
}

function normalizeEvidence(node, datasets, missing) {
  const dataset = mappedDataset(node, datasets);
  const rawState = first(node?.status, node?.state, dataset?.analysis_readiness, dataset?.readiness, dataset?.status);
  return {
    id: first(node?.id, node?.dataset_id, dataset?.dataset_id, node?.label),
    label: first(node?.label, node?.title, node?.dataset_id, dataset?.name, dataset?.dataset_id, "Unnamed evidence"),
    role: first(node?.role, node?.eyebrow, missing ? "Evidence requirement" : "Mapped evidence"),
    grain: first(node?.grain, dataset?.grain, "Grain not established"),
    coverage: first(node?.coverage, dataset?.coverage, "Coverage not established"),
    state: normalizeResearchState(rawState),
    stateLabel: missing ? facultyStateLabel(rawState || "unknown") : facultyStateLabel(rawState || "held"),
    datasetId: first(node?.dataset_id, dataset?.dataset_id),
    missing,
    provenance: first(node?.provenance, dataset?.provenance, dataset?.source),
  };
}

export function constructionMode(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const lifecycle = normalizeResearchState(execution.status || thread?.materialisation);
  if (lifecycle === "query_ready") return "query_ready";
  if (lifecycle === "registered") return "registered";
  if (lifecycle === "failed") return "failed";
  if (execution.status || state.execution_spec) return "execution";
  if (state.proposal) return "proposal";
  if (evidenceNodes(thread).length) return "explore";
  return "draft";
}

function methodView(state) {
  const proposal = state?.proposal || null;
  const executionSpec = state?.execution_spec || null;
  const acceptedDefinition = first(
    state?.method?.accepted_definition,
    state?.spec?.accepted_definition,
    executionSpec?.method,
    state?.spec?.method,
    state?.spec?.summary,
  );

  if (proposal) {
    return {
      state: "decision_required",
      label: "Waiting for your decision",
      acceptedDefinition: acceptedDefinition || "No accepted definition",
      proposedDefinition: first(proposal.summary, proposal.title, "A structured change is awaiting review"),
    };
  }
  if (executionSpec || state?.method?.accepted === true || state?.spec?.accepted === true) {
    return {
      state: "accepted",
      label: "Method accepted",
      acceptedDefinition: acceptedDefinition || "Accepted execution specification",
      proposedDefinition: "",
    };
  }
  return {
    state: "unresolved",
    label: "Research decision required",
    acceptedDefinition: "No method definition has been accepted",
    proposedDefinition: "",
  };
}

function outputView(thread, state) {
  const execution = state?.execution || {};
  const spec = state?.execution_spec || {};
  const target = targetNode(thread);
  const rawState = normalizeResearchState(execution.status || thread?.materialisation);
  const archiveVerified = Boolean(execution.drive_verified || execution.archive_verified);
  const registryVerified = ["registered", "query_ready"].includes(rawState) || Boolean(execution.registry_verified);
  return {
    datasetId: first(execution.output_dataset_id, spec.output_dataset_id),
    label: first(target?.label, execution.output_dataset_id, spec.output_dataset_id, "Output contract not established"),
    grain: asArray(spec.group_by).length ? spec.group_by.join(" × ") : first(state?.required_grain, state?.spec?.grain, target?.grain, "Grain not established"),
    status: rawState,
    statusLabel: rawState ? facultyStateLabel(rawState, { archiveVerified, registryVerified }) : "No output claimed",
    rows: execution.rows,
    manifestId: first(execution.manifest_id),
    archiveVerified,
    registryVerified,
  };
}

function nextDecisionView({ state, method, missing, output }) {
  const proposal = state?.proposal || null;
  const execution = state?.execution || {};
  const executionState = normalizeResearchState(execution.status);

  if (proposal) {
    return {
      type: "proposal",
      title: first(proposal.title, "Review proposed construction change"),
      detail: first(proposal.summary, "An exact revision is waiting for acceptance or rejection"),
      action: RESEARCH_ACTIONS.reviewDecision,
    };
  }
  if (executionState === "pending_approval") {
    return {
      type: "approval",
      title: "Approve governed execution",
      detail: "The execution request exists but no work should begin without an explicit decision",
      action: RESEARCH_ACTIONS.reviewDecision,
    };
  }
  if (missing.length) {
    return {
      type: "evidence_gap",
      title: `Resolve ${missing[0].label}`,
      detail: `${missing[0].grain} · ${missing[0].coverage}`,
      action: RESEARCH_ACTIONS.chooseRoute,
    };
  }
  if (method.state !== "accepted") {
    return {
      type: "method",
      title: "Define the research method",
      detail: "Choose the smallest defensible definition before execution or output claims",
      action: RESEARCH_ACTIONS.reviewDecision,
    };
  }
  if (state?.execution_spec && !execution.status) {
    return {
      type: "execution",
      title: "Approve construction execution",
      detail: `The accepted output contract targets ${output.datasetId || output.label}`,
      action: RESEARCH_ACTIONS.requestExecution,
    };
  }
  if (["registered", "query_ready"].includes(output.status)) {
    return {
      type: "evidence_asset",
      title: output.status === "query_ready" ? "Use the analysis-ready evidence asset" : "Inspect the registered evidence asset",
      detail: output.datasetId || output.label,
      action: RESEARCH_ACTIONS.inspectEvidence,
    };
  }
  return {
    type: "construction",
    title: "Develop the next research decision",
    detail: "Challenge the construction and identify the next material change",
    action: RESEARCH_ACTIONS.askConstruction,
  };
}

export function normalizeResearchConstruction(thread, datasets = []) {
  if (!thread) return null;
  const state = thread.state || {};
  const target = targetNode(thread);
  const evidence = evidenceNodes(thread);
  const held = evidence.filter((node) => !isMissingNode(node)).map((node) => normalizeEvidence(node, datasets, false));
  const missing = evidence.filter(isMissingNode).map((node) => normalizeEvidence(node, datasets, true));
  const method = methodView(state);
  const output = outputView(thread, state);
  const question = first(state.question, thread.question, thread.objective, state.objective, target?.interpretation, thread.title, state.title, "Research question not established");
  const unitOfAnalysis = first(state.unit_of_analysis, state.required_grain, state.spec?.grain, output.grain, "Unit of analysis not established");
  const population = first(state.population, state.spec?.population, state.context?.population, "Population not established");
  const period = first(state.period, state.spec?.period, target?.coverage, held[0]?.coverage, "Period not established");
  const nextDecision = nextDecisionView({ state, method, missing, output });

  return {
    id: text(thread.id, "construction-unidentified"),
    title: first(thread.title, state.title, "Untitled research construction"),
    question,
    unitOfAnalysis,
    population,
    period,
    evidenceHeld: held,
    evidenceMissing: missing,
    method,
    outputContract: output,
    nextDecision,
    provenance: {
      threadId: text(thread.id),
      updatedAt: first(thread.updated_at, state.updated_at),
      archiveVerified: output.archiveVerified,
      registryVerified: output.registryVerified,
      manifestId: output.manifestId,
    },
    relationships: {
      requires: missing.map((item) => item.id),
      holds: held.map((item) => item.id),
      proposes: state.proposal ? [state.proposal.id].filter(Boolean) : [],
      waitsFor: nextDecision ? [nextDecision.type] : [],
    },
    mode: constructionMode(thread),
    raw: thread,
  };
}

export function constructionComposerContext(view, selectedField = "construction") {
  if (!view) return "No active research construction is established.";
  const field = String(selectedField || "construction").trim();
  return [
    `construction_id: ${view.id}`,
    `selected_field: ${field}`,
    `question: ${view.question}`,
    `unit_of_analysis: ${view.unitOfAnalysis}`,
    `population: ${view.population}`,
    `period: ${view.period}`,
    `method_state: ${view.method.state}`,
    `accepted_method: ${view.method.acceptedDefinition}`,
    `evidence_held: ${view.evidenceHeld.map((item) => item.label).join(" | ") || "none mapped"}`,
    `evidence_missing: ${view.evidenceMissing.map((item) => item.label).join(" | ") || "none recorded"}`,
    `output_contract: ${view.outputContract.datasetId || view.outputContract.label}`,
    `next_decision: ${view.nextDecision.title}`,
  ].join("\n");
}

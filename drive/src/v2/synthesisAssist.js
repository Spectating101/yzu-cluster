import { rankCandidates } from "./joinCandidates.js";
import { synthesisJourneyStage, synthesisPreviewTruth } from "./synthesisLifecycle.js";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function statusOf(thread) {
  return text(thread?.state?.execution?.status).toLowerCase().replace(/-/g, "_");
}

function evidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function recommendedConstruction(thread) {
  const state = thread?.state || {};
  const rows = Array.isArray(state.constructions) ? state.constructions : [];
  return rows.find((row) => row?.recommended === true) || state.recommended_construction || null;
}

function bestJoin(thread) {
  return rankCandidates(thread?.state?.join_candidates || [])[0] || null;
}

function joinRisk(candidate) {
  if (!candidate) return "The population consequence of the join has not been resolved";
  if (!candidate.usable) return text(candidate.reason, "No usable join key has been established");
  const coverage = Number(candidate.coverage);
  const duplicates = Number(candidate.duplicates || 0);
  if (duplicates > 0) {
    return `${duplicates.toLocaleString()} extra right-side rows make the key non-unique`;
  }
  if (Number.isFinite(coverage)) {
    return `${coverage.toFixed(coverage % 1 ? 1 : 0)}% of the left-side entities match the strongest measured key`;
  }
  return "Join coverage has not been established";
}

function measuredEvidenceRisk(state) {
  const profiles = Array.isArray(state?.column_profiles) ? state.column_profiles : [];
  const flaggedProfiles = profiles.filter((profile) => (profile?.flags || []).length);
  if (!flaggedProfiles.length) {
    return "No measured column risk is flagged, but construct validity still requires researcher judgement";
  }
  const flaggedKinds = [...new Set(flaggedProfiles.flatMap((profile) => profile?.flags || []).filter(Boolean))];
  if (flaggedProfiles.length === 1 && flaggedKinds.length === 1) {
    return `1 ${String(flaggedKinds[0]).replace(/[_-]+/g, " ")} / flagged column`;
  }
  return `${flaggedProfiles.length} flagged column${flaggedProfiles.length === 1 ? "" : "s"}`;
}

function previewStatus(preview) {
  if (preview.failed) return "failed";
  if (preview.succeeded) return "passed";
  if (preview.stale) return "stale";
  return "required";
}

/**
 * Canonical researcher-facing interpretation of one durable Synthesis thread.
 *
 * The centre, Detail rail, Ask starter prompts and rail context should consume
 * this helper instead of independently translating lifecycle state. Durable
 * backend state remains authoritative; this function only gives that state one
 * consistent product-language interpretation.
 */
export function synthesisAssist(thread) {
  const state = thread?.state || {};
  const status = statusOf(thread);
  const stage = synthesisJourneyStage(thread);
  const preview = synthesisPreviewTruth(thread);
  const evidence = evidenceNodes(thread);
  const join = bestJoin(thread);
  const recommendation = recommendedConstruction(thread);

  if (!thread?.id || thread?.ephemeral || state.ephemeral) {
    return {
      stage: "objective",
      label: "Research objective",
      decisionKind: "define_objective",
      status: "Draft entry",
      decision: "Define the research object",
      risk: "Nothing is saved until you create the build",
      next: "State the research purpose or reuse a method saved to Library",
      prompts: [
        "Help me sharpen this research object without choosing a method yet.",
        "Which part of this research purpose is still ambiguous?",
        "What grain and time horizon should I state before creating this construction?",
      ],
    };
  }

  if (stage === "evidence") {
    return {
      stage,
      label: "Evidence mapping",
      decisionKind: "map_evidence",
      status: evidence.length ? "Evidence mapped" : "Evidence needed",
      decision: evidence.length ? "Decide what the mapped evidence actually establishes" : "Find and review data in your Library",
      risk: evidence.length ? "Mapped evidence does not by itself establish construct validity" : "The build has no reviewed evidence yet",
      next: evidence.length ? "Identify the next material build decision" : "Review data in your Library before method reasoning",
      prompts: evidence.length
        ? [
            "Why do these inputs belong in this construct?",
            "Which part of the research object is still unsupported?",
            "Challenge the role assigned to the weakest mapped source.",
            "What missing evidence should I route to Discover?",
          ]
        : [
            "What evidence would actually support this research object?",
            "Which Library evidence roles should I look for first?",
            "What would count as a misleading proxy for this construct?",
          ],
    };
  }

  if (stage === "specification") {
    if (state.scope_block) {
      return {
        stage,
        label: "Scope decision",
        decisionKind: "resolve_scope",
        status: "Scope decision needed",
        decision: "Choose the defensible supported population",
        risk: text(state.scope_block.summary || state.scope_block.reason, "The current input exceeds a safe or supported scope"),
        next: "Choose a scope explicitly; the engine will not trim evidence silently",
        prompts: [
          "What evidence would each scope option remove from my question?",
          "Which scope loses the least identifying variation?",
          "Would the recommended cut change the population my question describes?",
        ],
      };
    }

    if (state.unit_conflict) {
      return {
        stage,
        label: "Measurement decision",
        decisionKind: "resolve_units",
        status: "Measurement decision needed",
        decision: "Resolve the incompatible measurement scales",
        risk: text(state.unit_conflict.summary || state.unit_conflict.reason, "Two plausible scales produce materially different answers"),
        next: "Choose the documented scale interpretation before combining the fields",
        prompts: [
          "Which published definition supports each measurement scale?",
          "Show what the result would mean under each unit interpretation.",
          "What external documentation would actually resolve this conflict?",
        ],
      };
    }

    if (join) {
      return {
        stage,
        label: "Join decision",
        decisionKind: "resolve_join",
        status: "Join decision needed",
        decision: "Choose how these evidence sources become one study population",
        risk: joinRisk(join),
        next: "Choose the join key and the population consequence deliberately",
        prompts: [
          "Explain the unmatched population in this join.",
          "Compare the research consequence of inner versus left join here.",
          "Which join key is defensible and why?",
          "Is this measured match rate too weak to use this evidence source?",
        ],
      };
    }

    if (recommendation) {
      return {
        stage,
        label: "Suggested build",
        decisionKind: "review_recommendation",
        status: "Build suggested",
        decision: "Review the suggested build and decide whether to design its method",
        risk: "A recommendation remains a proxy design until the researcher accepts and specifies it",
        next: "Accept the recommendation for detailed method design or challenge it in Ask",
        prompts: [
          "Why is this construction preferred over the alternatives?",
          "Challenge the main validity assumption in this recommendation.",
          "What would falsify this proposed proxy construction?",
          "Which limitation should stop me from accepting this recommendation?",
        ],
      };
    }

    return {
      stage,
      label: "Method design",
      decisionKind: "design_method",
      status: "Evidence measured",
      decision: "Review measured evidence and propose a build for review",
      risk: measuredEvidenceRisk(state),
      next: "Request a suggested build for method review",
      prompts: [
        "What is the next material method decision in this construction?",
        "Separate measured facts from methodological assumptions here.",
        "What validation or falsification check should exist before proposal review?",
      ],
    };
  }

  if (stage === "proposal") {
    return {
      stage,
      label: "Proposal review",
      decisionKind: "review_proposal",
      status: "Proposal needs review",
      decision: "Accept or reject this version of the proposal",
      risk: "Accepting this version of the method allows a sample preview",
      next: "Challenge the change set, then accept or reject it explicitly",
      prompts: [
        "Challenge this exact proposal before I accept it.",
        "Which assumption changes if I accept this revision?",
        "What remains unmeasured or unresolved in this proposal?",
        "What falsification check is still missing from this method?",
      ],
    };
  }

  if (stage === "preview") {
    const pStatus = previewStatus(preview);
    if (pStatus === "failed") {
      return {
        stage,
        label: "Preview failed",
        decisionKind: "recover_preview",
        status: "Preview failed",
        decision: "Inspect the failed sample test before retrying",
        risk: text(preview.preview?.error, "The accepted recipe did not complete on sample data"),
        next: "Retry only if the same method is still defensible; otherwise revise the proposal",
        prompts: [
          "Diagnose this Preview failure without changing the method yet.",
          "Is a retry sufficient, or does this failure require a method revision?",
          "Which part of the accepted recipe caused the bounded run to fail?",
        ],
      };
    }
    if (pStatus === "passed") {
      const rows = Number(preview.preview?.sampling?.previewed_rows);
      return {
        stage,
        label: "Preview passed",
        decisionKind: "review_preview",
        status: "Preview passed",
        decision: "Decide whether to request execution approval for this previewed version",
        risk: Number.isFinite(rows)
          ? `The receipt covers ${rows.toLocaleString()} sample input rows, not the full population`
          : "The record covers a sample, not the full population",
        next: "Review row effects and warnings, then request approval only if the receipt is acceptable",
        prompts: [
          "Explain the row changes and diagnostics in this Preview receipt.",
          "Are any Preview warnings material enough to stop approval?",
          "What does this bounded Preview fail to cover?",
          "Is there a defensible reason not to request execution approval yet?",
        ],
      };
    }
    return {
      stage,
      label: pStatus === "stale" ? "Preview stale" : "Preview required",
      decisionKind: "run_preview",
      status: pStatus === "stale" ? "Preview stale" : "Preview required",
      decision: pStatus === "stale" ? "Rerun the sample preview for this accepted version" : "Test the accepted recipe on sample data",
      risk: pStatus === "stale"
        ? "The saved test record belongs to an older version of the method or inputs"
        : "The accepted recipe has not yet been executed on sample data",
      next: "Run Preview and inspect its receipt before requesting approval",
      prompts: [
        "What exactly will bounded Preview test for this method?",
        "What can a successful Preview still not establish?",
        "Which row-loss or join diagnostics should I pay attention to?",
      ],
    };
  }

  if (stage === "approval") {
    return {
      stage,
      label: "Execution approval",
      decisionKind: "approve_execution",
      status: "Waiting for your approval",
      decision: "Authorize or reject the exact previewed execution request",
      risk: "No worker is authorized to run until this approval is granted",
      next: "Review this version, sample preview evidence, inputs, and requested output before deciding",
      prompts: [
        "Tell me exactly what I would authorize by approving this execution.",
        "Which method and input revisions are bound to this approval request?",
        "What can still change after I approve this build?",
        "Which evidence in the Preview should matter most to this approval?",
      ],
    };
  }

  if (stage === "build") {
    if (status === "failed") {
      return {
        stage,
        label: "Build failed",
        decisionKind: "recover_build",
        status: "Execution failed",
        decision: "Diagnose the recorded failure before retrying or revising",
        risk: text(state.execution?.error, "This failed execution produced no output saved to Library"),
        next: "Distinguish a retryable worker failure from a build defect",
        prompts: [
          "Diagnose this Build failure without inventing an output.",
          "Is a retry sufficient, or should I revise the construction first?",
          "Which durable execution evidence tells us where this failed?",
        ],
      };
    }
    if (status === "completed") {
      return {
        stage,
        label: "Build completed",
        decisionKind: "await_registration",
        status: "Worker completed",
        decision: "Wait for archive and registry proof",
        risk: "Worker completion does not confirm the output is saved to Library or ready to query",
        next: "Wait until Library checks confirm the result before reusing the output",
        prompts: [
          "What proof is still missing before this worker output becomes a Library asset?",
          "Explain the difference between worker completion and registration here.",
          "Is there any indication registration is blocked?",
        ],
      };
    }
    return {
      stage,
      label: "Build",
      decisionKind: "observe_build",
      status: status === "running" ? "Execution running" : status === "queued" ? "Execution queued" : "Saving to Library",
      decision: "Follow the saved execution evidence. No new method decision is required while this accepted build is running",
      risk: "No output is confirmed as saved to Library until archive and Library checks pass",
      next: "Wait for the worker and Library checks to save result evidence",
      prompts: [
        "What has this Build established so far?",
        "What remains unverified until registration completes?",
        "Does the current worker evidence indicate a problem?",
      ],
    };
  }

  if (stage === "result") {
    const queryReady = status === "query_ready" || thread?.materialisation === "query_ready";
    return {
      stage,
      label: queryReady ? "Result ready to query" : "Result saved to Library",
      decisionKind: queryReady ? "reuse_result" : "inspect_result",
      status: queryReady ? "Output ready to query" : "Output saved to Library",
      decision: queryReady ? "Use or reuse the dataset saved to Library" : "Inspect the saved dataset and what remains before it can be used",
      risk: queryReady
        ? "Downstream studies still inherit the build's recorded limitations"
        : "Saving to Library does not confirm readiness to query without a separate check",
      next: queryReady ? "Open the dataset in Library or start a reviewed variation" : "Inspect readiness in Library before downstream analysis",
      prompts: queryReady
        ? [
            "Audit this asset's provenance and construction limitations.",
            "How should I use this query-ready asset defensibly?",
            "Which limitations must downstream studies inherit?",
            "What should change if I start a new variation from this method?",
          ]
        : [
            "Audit this registered asset's provenance.",
            "What remains before this asset is query-ready?",
            "How could another construction reuse this result without overstating readiness?",
          ],
    };
  }

  return {
    stage,
    label: "Synthesis",
    decisionKind: "inspect_state",
    status: text(state.maturityLabel || state.maturity, "Synthesis state"),
    decision: "Inspect the current saved research state",
    risk: "Do not infer progress beyond the recorded thread state",
    next: "Use Ask to identify the next defensible research decision",
    prompts: [
      "Explain the current construction and its authority state.",
      "What is the next defensible research decision?",
      "Which assumption should I challenge before continuing?",
    ],
  };
}

export function synthesisAskPrompts(thread) {
  return synthesisAssist(thread).prompts;
}

// These display strings also appear in Ask context. Keep the request wording
// stable while the interface uses the researcher-facing vocabulary.
const REQUEST_COPY = {
  "Nothing is saved until you create the build": "Nothing is durable until the construction is created",
  "State the research purpose or reuse a method saved to Library": "State the research purpose or reuse a registered method",
  "Find and review data in your Library": "Find and review held Library evidence",
  "The build has no reviewed evidence yet": "The construction has no reviewed evidence yet",
  "Identify the next material build decision": "Identify the next material construction decision",
  "Review data in your Library before method reasoning": "Review held evidence before method reasoning",
  "Suggested build": "Construction recommendation",
  "Build suggested": "Construction recommended",
  "Review the suggested build and decide whether to design its method": "Review the recommendation and decide whether this is the right construction to design",
  "Review measured evidence and propose a build for review": "Review measured evidence and turn it into one reviewable construction",
  "Request a suggested build for method review": "Request one reviewable construction for explicit method review",
  "Accept or reject this version of the proposal": "Accept or reject this exact revision-bound proposal",
  "Accepting this version of the method allows a sample preview": "Acceptance makes this exact method revision eligible for bounded Preview",
  "Inspect the failed sample test before retrying": "Inspect the bounded failure before retrying",
  "The accepted recipe did not complete on sample data": "The accepted recipe did not complete on bounded bytes",
  "Decide whether to request execution approval for this previewed version": "Decide whether this exact previewed revision should request execution approval",
  "The record covers a sample, not the full population": "The receipt is bounded evidence, not a full-population result",
  "Rerun the sample preview for this accepted version": "Rerun Preview for the current accepted revision",
  "Test the accepted recipe on sample data": "Test the accepted recipe on bounded bytes",
  "The saved test record belongs to an older version of the method or inputs": "The saved receipt belongs to an older method or input revision",
  "The accepted recipe has not yet been executed on sample data": "The accepted recipe has not yet been executed on bounded bytes",
  "Waiting for your approval": "Approval required",
  "Review this version, sample preview evidence, inputs, and requested output before deciding": "Review the revision, Preview evidence, inputs and requested output before deciding",
  "This failed execution produced no output saved to Library": "No registered output exists from this failed execution",
  "Distinguish a retryable worker failure from a build defect": "Distinguish a retryable worker failure from a construction defect",
  "Worker completion does not confirm the output is saved to Library or ready to query": "Worker completion is not registration or query readiness",
  "Wait until Library checks confirm the result before reusing the output": "Do not reuse the output until registry evidence promotes it to Result",
  "Saving to Library": "Registration in progress",
  "Follow the saved execution evidence. No new method decision is required while this accepted build is running": "Observe durable execution proof; no new method decision is required while the accepted build is active",
  "No output is confirmed as saved to Library until archive and Library checks pass": "No registered output is claimed until archive and registry proof exists",
  "Wait for the worker and Library checks to save result evidence": "Wait for the worker and registry lifecycle to produce durable evidence",
  "Result ready to query": "Query-ready result",
  "Result saved to Library": "Registered result",
  "Output ready to query": "Query-ready output",
  "Output saved to Library": "Registered output",
  "Use or reuse the dataset saved to Library": "Use or reuse the registered research asset",
  "Inspect the saved dataset and what remains before it can be used": "Inspect the registered asset and its readiness boundary",
  "Downstream studies still inherit the build's recorded limitations": "Downstream studies still inherit the construction's recorded limitations",
  "Saving to Library does not confirm readiness to query without a separate check": "Registration does not imply query readiness unless it is explicitly verified",
  "Open the dataset in Library or start a reviewed variation": "Open the asset in Library or start a reviewed variation",
  "Inspect the current saved research state": "Inspect the current durable research state",
};

export function synthesisRequestCopy(value) {
  if (typeof value !== "string") return value;
  return Object.hasOwn(REQUEST_COPY, value) ? REQUEST_COPY[value] : value.replace(
    " sample input rows, not the full population",
    " bounded input rows, not the full population",
  );
}

export function synthesisAssistRequestContext(thread) {
  const assist = synthesisAssist(thread);
  return {
    label: synthesisRequestCopy(assist.label),
    decision: synthesisRequestCopy(assist.decision),
    risk: synthesisRequestCopy(assist.risk),
  };
}

export function synthesisRailContextForRequest(context) {
  if (context?.entity?.kind !== "synthesis_thread") return context;
  const selected = { ...context.selected };
  for (const key of ["synthesis_stage_label", "current_decision", "decision_risk", "decision_next"]) {
    if (Object.hasOwn(selected, key)) selected[key] = synthesisRequestCopy(selected[key]);
  }
  return {
    ...context,
    entity: { ...context.entity, status: synthesisRequestCopy(context.entity.status) },
    selected,
  };
}

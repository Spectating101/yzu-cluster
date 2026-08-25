import {
  RailDecisionSummary,
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { isPreAcceptance, recommendedConstruction, researchBrief } from "@/v2/synthesisBrief.js";

function text(value, fallback = "Not reported") {
  return String(value || "").trim() || fallback;
}

function compactObjective(value, limit = 300) {
  const full = text(value, "A durable research-construction thread.").replace(/\s+/g, " ");
  if (full.length <= limit) return full;
  const boundary = full.lastIndexOf(" ", limit - 1);
  return `${full.slice(0, boundary > 0 ? boundary : limit).trim()}…`;
}

function normalizedExecutionStatus(thread) {
  return String(thread?.state?.execution?.status || "").trim().toLowerCase().replace(/-/g, "_");
}

function evidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function stateSummary(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const status = normalizedExecutionStatus(thread);
  const queryReady = status === "query_ready" || thread?.materialisation === "query_ready";
  const registered = queryReady || status === "registered" || thread?.materialisation === "registered";

  if (registered) {
    return {
      status: queryReady ? "Query-ready output" : "Registered output",
      primary: "Open the reusable asset",
      risk: execution.drive_verified ? "Drive verification reported" : "Verification detail not reported",
      next: queryReady ? "Query or inspect the asset in Library" : "Inspect readiness in Library",
    };
  }
  if (status === "failed") {
    return {
      status: "Execution failed",
      primary: "Inspect the recorded failure",
      risk: text(execution.error, "Failure detail not reported"),
      next: "Revise or retry the accepted specification",
    };
  }
  if (status === "pending_approval") {
    return {
      status: "Approval required",
      primary: "Review the exact execution request",
      risk: "No worker is authorized to run yet",
      next: "Approve or reject this revision-bound request",
    };
  }
  if (["queued", "running"].includes(status)) {
    return {
      status: status === "running" ? "Execution running" : "Execution queued",
      primary: "Follow the execution record",
      risk: "No registered output is claimed yet",
      next: "Wait for durable worker evidence",
    };
  }
  if (["registering", "archiving", "completed"].includes(status)) {
    return {
      status: status === "completed" ? "Worker completed" : "Registration in progress",
      primary: "Verify archive and registry proof",
      risk: "Worker completion is not registration",
      next: "Wait for explicit registered-output evidence",
    };
  }
  if (state.execution_spec) {
    return {
      status: "Accepted method",
      primary: "Request execution",
      risk: "No execution has been requested yet",
      next: "Submit the exact specification for researcher approval",
    };
  }
  if (state.proposal) {
    return {
      status: "Proposal needs review",
      primary: "Inspect the proposed change",
      risk: "No method change is accepted yet",
      next: "Accept or reject the exact proposal",
    };
  }
  return {
    status: text(state.maturityLabel || state.maturity, "Exploring"),
    primary: "Continue the research construction",
    risk: "No output is registered",
    next: "Use Ask to constrain or propose the next method change",
  };
}

function openingDecision(thread) {
  const state = thread?.state || {};
  const proposal = state.proposal || null;
  const recommendation = recommendedConstruction(thread);
  const nodes = evidenceNodes(thread);
  const profiles = Array.isArray(state.column_profiles) ? state.column_profiles : [];
  const flagged = profiles.filter((profile) => (profile.flags || []).length).length;
  const lookahead = profiles.filter((profile) => (profile.flags || []).includes("lookahead")).length;
  const join = (state.join_candidates || [])[0] || null;
  const fanout = Number(join?.fanout_multiplier);
  const rightDuplicates = Number(join?.right_duplicate_rows);
  const directMeasure = recommendation.idealDirectMeasure || {};
  const proposalPatch = (proposal?.operations || []).find((operation) => operation?.op === "update_spec")?.patch || {};
  const limitations = Array.isArray(proposalPatch.limitations) ? proposalPatch.limitations.filter(Boolean) : [];

  if (proposal) {
    return {
      status: "Proposal needs review",
      primary: "Review the exact proposal",
      risk: limitations[0] || "No method change is accepted yet",
      next: "Accept or reject this revision-bound proposal in the centre workspace.",
    };
  }

  if (state.scope_block) {
    return {
      status: "Scope decision needed",
      primary: "Resolve the supported scope",
      risk: text(state.scope_block.summary || state.scope_block.reason, "The requested scope is not fully supported by held evidence"),
      next: "Choose a defensible scope before method design continues.",
    };
  }

  if (state.unit_conflict) {
    return {
      status: "Measurement decision needed",
      primary: "Resolve the unit conflict",
      risk: text(state.unit_conflict.summary || state.unit_conflict.reason, "The mapped evidence contains incompatible measurement scales"),
      next: "Choose the defensible scale interpretation before the construction advances.",
    };
  }

  if (join && ((Number.isFinite(fanout) && fanout > 1) || rightDuplicates > 0)) {
    return {
      status: "Join decision needed",
      primary: "Review the join consequence",
      risk: Number.isFinite(fanout) && fanout > 1
        ? `Matched rows fan out ${fanout.toLocaleString()}×`
        : "The candidate key repeats on the right side",
      next: "Resolve key choice or duplicate handling before accepting a method.",
    };
  }

  if (recommendation.present) {
    return {
      status: "Construction recommended",
      primary: "Review the recommendation",
      risk: directMeasure.label
        ? `${directMeasure.label} is unavailable${directMeasure.why ? ` · ${directMeasure.why}` : ""}`
        : "The recommendation remains a proxy construction until accepted",
      next: "Accept it to begin detailed method design, or challenge it in Ask.",
    };
  }

  if (nodes.length) {
    const measuredRisk = lookahead
      ? `${lookahead} look-ahead column${lookahead === 1 ? "" : "s"} could leak future information`
      : flagged
        ? `${flagged} measured column${flagged === 1 ? "" : "s"} need review`
        : "No construction has been accepted yet";
    return {
      status: profiles.length ? "Evidence measured" : "Evidence mapped",
      primary: profiles.length ? "Review measured evidence" : "Review mapped evidence",
      risk: measuredRisk,
      next: "Request one reviewable construction grounded in these held inputs.",
    };
  }

  return {
    status: "Exploration ready",
    primary: "Find held evidence",
    risk: "No evidence is mapped yet",
    next: "Map held Library evidence before method reasoning.",
  };
}

function OpeningThreadRail({ thread, onAsk }) {
  const state = thread?.state || {};
  const brief = researchBrief(thread);
  const recommendation = recommendedConstruction(thread);
  const nodes = evidenceNodes(thread);
  const profiles = Array.isArray(state.column_profiles) ? state.column_profiles : [];
  const flagged = profiles.filter((profile) => (profile.flags || []).length).length;
  const proposal = state.proposal || null;
  const summary = openingDecision(thread);
  const measurement = profiles.length
    ? `${profiles.length.toLocaleString()} columns · ${flagged.toLocaleString()} flagged`
    : nodes.length
      ? "Measurement pending"
      : "Not measured";
  const interpretation = proposal?.title
    || (recommendation.present ? recommendation.title : "No construction recommended yet");
  const target = {
    kind: "synthesis_thread",
    id: thread?.id,
    title: thread?.title || state.title || "Synthesis thread",
    thread,
  };

  return (
    <div data-testid="synthesis-opening-rail">
      <RailFrame>
        <RailEntityHeader
          id={thread?.id}
          title={thread?.title || state.title || "Synthesis thread"}
          description={compactObjective(brief.body || thread?.objective, 220)}
        />
        <RailDecisionSummary
          {...summary}
          labels={{ primary: "Needs you" }}
        />
        <div className="rd-v2-rail-scroll">
          <RailFieldGrid>
            <RailField label="Target grain" value={brief.targetGrain || state.required_grain || "Not stated"} />
            <RailField label="Evidence" value={nodes.length ? `${nodes.length} mapped input${nodes.length === 1 ? "" : "s"}` : "None mapped"} />
            <RailField label="Measured" value={measurement} />
            <RailField label="Interpretation" value={interpretation} />
            <RailField label="Method" value={proposal ? "Proposal awaiting review" : "Not accepted"} />
            <RailField label="Output" value="Not registered" />
          </RailFieldGrid>
        </div>
        <RailStickyFooter>
          {typeof onAsk === "function" ? (
            <button
              type="button"
              className="rd-v2-btn"
              onClick={() => onAsk("Challenge the current Synthesis decision. Separate what is measured, what is AI interpretation, and what still requires researcher judgement.")}
            >
              Ask about this decision
            </button>
          ) : null}
        </RailStickyFooter>
      </RailFrame>
    </div>
  );
}

export function SynthesisThreadRailPanel({ thread, onAskAbout, onOpenInLibrary }) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const status = normalizedExecutionStatus(thread);
  const queryReady = status === "query_ready" || thread?.materialisation === "query_ready";
  const registered = queryReady || status === "registered" || thread?.materialisation === "registered";
  const outputId = execution.output_dataset_id || state.execution_spec?.output_dataset_id || "";
  const summary = stateSummary(thread);
  const sources = evidenceNodes(thread)
    .map((node) => node.label || node.dataset_id)
    .filter(Boolean);
  const specInput = state.execution_spec?.input_dataset_id || state.proposal?.execution_spec?.input_dataset_id || "";
  const evidenceValue = sources.length
    ? `${sources.length} mapped inputs`
    : specInput
      ? `Declared input · ${state.execution_spec ? "accepted" : "proposed"}: ${specInput}`
      : "No inputs mapped";

  if (isPreAcceptance(thread)) {
    const target = {
      kind: "synthesis_thread",
      id: thread?.id,
      title: thread?.title || state.title || "Synthesis thread",
      thread,
    };
    return (
      <OpeningThreadRail
        thread={thread}
        onAsk={onAskAbout ? (prompt) => onAskAbout(target, prompt) : null}
      />
    );
  }

  return (
    <RailFrame>
      <RailEntityHeader
        id={thread?.id}
        title={thread?.title || state.title || "Synthesis thread"}
        description={compactObjective(thread?.objective || state.objective)}
      />
      <RailDecisionSummary {...summary} labels={{ primary: "Needs you" }} />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Grain" value={state.required_grain || state.spec?.grain} />
          <RailField label="Evidence" value={evidenceValue} />
          <RailField label="Proposal" value={state.proposal?.title || "No proposal awaiting review"} />
          <RailField label="Execution" value={execution.status || (state.execution_spec ? "Not requested" : "Not specified")} />
          <RailField label="Output" value={outputId || "Not registered"} mono={Boolean(outputId)} />
          <RailField label="Manifest" value={execution.manifest_id || "Not reported"} mono={Boolean(execution.manifest_id)} />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        {outputId && registered ? (
          <button
            type="button"
            className="rd-v2-btn primary"
            onClick={() => onOpenInLibrary?.({
              dataset_id: outputId,
              name: outputId,
              analysis_readiness: queryReady ? "query_ready" : "registered",
            })}
          >
            Open in Library
          </button>
        ) : null}
        <button type="button" className="rd-v2-btn" onClick={onAskAbout}>
          Ask about this decision
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}

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

function OpeningThreadRail({ thread, onAsk }) {
  const state = thread?.state || {};
  const brief = researchBrief(thread);
  const recommendation = recommendedConstruction(thread);
  const proposal = state.proposal || null;
  const proposalPatch = (proposal?.operations || []).find((operation) => operation?.op === "update_spec")?.patch || {};
  const proposalEvidence = Array.isArray(proposalPatch.coreEvidence) ? proposalPatch.coreEvidence.filter(Boolean) : [];
  const proposalLimitations = Array.isArray(proposalPatch.limitations) ? proposalPatch.limitations.filter(Boolean) : [];
  const sourceNodes = Array.isArray(recommendation.nodes) ? recommendation.nodes : [];
  const sourceCount = sourceNodes.length || proposalEvidence.length;
  const directMeasure = recommendation.idealDirectMeasure || {};
  const recordedAssumption = text(
    state.important_assumption || state.assumption || state.method_assumption,
    "No material assumption has been recorded yet.",
  );
  const limitation = proposalLimitations[0]
    || (directMeasure.label
      ? `${directMeasure.label} is unavailable${directMeasure.why ? ` · ${directMeasure.why}` : ""}.`
      : "The recommendation is not yet grounded in a stated direct measure.");
  const ask = (prompt) => onAsk?.(prompt);
  const fullIntent = text(brief.body || thread?.objective, "A durable research-construction thread.").replace(/\s+/g, " ");
  const intentSummary = compactObjective(fullIntent, 160);
  const intentIsCompact = intentSummary !== fullIntent;
  const profiles = Array.isArray(state.column_profiles) ? state.column_profiles : [];
  const flagged = profiles.filter((profile) => (profile.flags || []).length).length;
  const lookahead = profiles.filter((profile) => (profile.flags || []).includes("lookahead")).length;
  const mappedInputs = Array.isArray(state.input_dataset_ids)
    ? state.input_dataset_ids.length
    : (state.nodes || []).filter((node) => node?.layer === "evidence" || node?.type === "source").length;
  const join = (state.join_candidates || [])[0] || null;
  const matched = Number(join?.matched);
  const leftDistinct = Number(join?.left_distinct ?? join?.total);
  const fanout = Number(join?.fanout_multiplier);
  const joinConsequence = Number.isFinite(fanout) && fanout > 1
    ? ` · matched rows fan out ${fanout.toLocaleString()}×`
    : Number(join?.right_duplicate_rows) > 0 ? " · repeated right key" : "";
  const joinSummary = join
    ? Number.isFinite(matched) && Number.isFinite(leftDistinct) && leftDistinct > 0
      ? `${matched.toLocaleString()}/${leftDistinct.toLocaleString()} identifiers match${joinConsequence}.`
      : `${join.match_rate_pct}% identifier coverage.`
    : "";

  return (
    <div className="s04-thread-rail" data-testid="synthesis-opening-rail">
      <p className="s04-thread-rail-kicker">Synthesis thread</p>
      <section>
        <p className="s04-thread-rail-label">Your intent</p>
        <p>{intentSummary}</p>
        {intentIsCompact ? (
          <details className="s04-thread-rail-intent">
            <summary>Full recorded intent</summary>
            <p>{fullIntent}</p>
          </details>
        ) : null}
      </section>
      <section>
        <p className="s04-thread-rail-label">Desk measurements</p>
        {profiles.length ? (
          <>
            <p>{mappedInputs} mapped input{mappedInputs === 1 ? "" : "s"} · {profiles.length.toLocaleString()} columns profiled · no assistant involved.</p>
            <ul>
              <li>{flagged.toLocaleString()} column{flagged === 1 ? "" : "s"} flagged for review.</li>
              {lookahead ? <li>{lookahead.toLocaleString()} look-ahead column{lookahead === 1 ? "" : "s"} could leak future information.</li> : null}
              {state.unit_conflict ? <li>Incompatible measurement scales need a decision.</li> : null}
              {joinSummary ? <li>{joinSummary}</li> : null}
            </ul>
          </>
        ) : <p>No held-byte measurement has been recorded yet.</p>}
      </section>
      <section>
        <p className="s04-thread-rail-label">AI interpretation</p>
        <p>
          {proposal
            ? `${text(proposal.title, "A review-only construction")} is recorded for review. It is not accepted or executed.`
            : recommendation.present
            ? `${recommendation.title} is the current evidence-grounded recommendation.`
            : "No construction has been recommended yet."}
        </p>
      </section>
      <section>
        <p className="s04-thread-rail-label">Important assumption</p>
        <p>{recordedAssumption}</p>
      </section>
      <section>
        <p className="s04-thread-rail-label">Why this route</p>
        {sourceCount ? (
          <ul>
            <li>{sourceCount} distinct evidence role{sourceCount === 1 ? "" : "s"} contribute to the construction.</li>
            <li>Target grain: {text(brief.targetGrain, "not stated")}.</li>
            {recommendation.validationRole ? <li>Validation route: {recommendation.validationRole}.</li> : null}
          </ul>
        ) : <p>No route rationale has been recorded yet.</p>}
      </section>
      <section>
        <p className="s04-thread-rail-label">Main limitation</p>
        <p>{limitation}</p>
      </section>
      {typeof onAsk === "function" ? (
        <section className="s04-thread-rail-questions">
          <p className="s04-thread-rail-label">Quick questions</p>
          <button type="button" onClick={() => ask("Why is this validation route appropriate for the proposed construction?")}>Why this validation route?</button>
          <button type="button" onClick={() => ask("Compare the alternative constructions and identify the decision trade-offs.")}>Compare alternatives</button>
          <button type="button" onClick={() => ask("What decisions remain before a detailed method can be drafted?")}>What decisions come next?</button>
        </section>
      ) : null}
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
  const sources = (state.nodes || [])
    .filter((node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct")
    .map((node) => node.label || node.dataset_id)
    .filter(Boolean);
  // A method can be proposed or accepted before its input ever becomes a
  // mapped evidence node (state.nodes stays empty through that whole path).
  // "No inputs mapped" would then sit next to a proposal/execution record
  // that names a specific input dataset — a real, verified contradiction,
  // not just a missing-data default. Distinguish declared-but-unmapped from
  // genuinely nothing yet, and keep "accepted" vs "proposed" honest rather
  // than folding either into the verified "mapped inputs" count.
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
        title={thread?.title || state.title || "Synthesis thread"}
        description={compactObjective(thread?.objective || state.objective)}
      />
      <RailDecisionSummary {...summary} />
      <RailFieldGrid>
        <RailField label="Grain" value={state.required_grain || state.spec?.grain} />
        <RailField label="Evidence" value={evidenceValue} />
        <RailField label="Proposal" value={state.proposal?.title || "No proposal awaiting review"} />
        <RailField label="Execution" value={execution.status || "Not requested"} />
        <RailField label="Output" value={outputId || "Not registered"} mono={Boolean(outputId)} />
        <RailField label="Manifest" value={execution.manifest_id || "Not reported"} mono={Boolean(execution.manifest_id)} />
      </RailFieldGrid>
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
          Ask about this thread
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}

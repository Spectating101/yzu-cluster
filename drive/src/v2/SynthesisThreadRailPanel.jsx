import {
  RailDecisionSummary,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { synthesisAssist } from "@/v2/synthesisAssist.js";
import { synthesisPreviewTruth } from "@/v2/synthesisLifecycle";
import { isPreAcceptance, recommendedConstruction, researchBrief } from "@/v2/synthesisBrief.js";
import "./synthesis-convergence.css";

function normalizedExecutionStatus(thread) {
  return String(thread?.state?.execution?.status || "").trim().toLowerCase().replace(/-/g, "_");
}

function evidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function railSummary(thread) {
  const assist = synthesisAssist(thread);
  const status = normalizedExecutionStatus(thread);
  const primaryLabel = assist.stage === "result"
    ? "Action"
    : assist.stage === "build" && status !== "failed"
      ? "Now"
      : "Needs you";
  return {
    status: assist.status,
    primary: assist.decision,
    primaryLabel,
    risk: assist.risk,
    next: assist.next,
  };
}

function NewEntryRail({ onAsk }) {
  const assist = synthesisAssist({ ephemeral: true, state: { ephemeral: true } });
  return (
    <RailFrame>
      <RailDecisionSummary
        status={assist.status}
        primary={assist.decision}
        risk={assist.risk}
        next={assist.next}
        labels={{ primary: "Needs you" }}
      />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="State" value="Not saved" />
          <RailField label="Evidence" value="None selected" />
          <RailField label="Method" value="None proposed" />
          <RailField label="Execution" value="Not available before later approval" />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        {typeof onAsk === "function" ? (
          <button type="button" className="rd-v2-btn" onClick={() => onAsk(assist.prompts[0])}>
            Ask about framing the objective
          </button>
        ) : null}
      </RailStickyFooter>
    </RailFrame>
  );
}

function OpeningThreadRail({ thread, onAsk }) {
  const state = thread?.state || {};
  const brief = researchBrief(thread);
  const nodes = evidenceNodes(thread);
  const recommendation = recommendedConstruction(thread);
  const profiles = Array.isArray(state.column_profiles) ? state.column_profiles : [];
  const proposal = state.proposal || null;
  const assist = synthesisAssist(thread);
  const measurement = profiles.length
    ? `${profiles.length.toLocaleString()} column${profiles.length === 1 ? "" : "s"}`
    : nodes.length
      ? "Measurement pending"
      : "Not measured";
  const evidence = nodes.length
    ? `${nodes.length} mapped`
    : recommendation.present
      ? `${recommendation.nodes.length} evidence role${recommendation.nodes.length === 1 ? "" : "s"}`
      : "None mapped";
  const method = proposal
    ? "Proposal awaiting review"
    : recommendation.present
      ? "Recommended · not accepted"
      : "Not accepted";

  return (
    <div data-testid="synthesis-opening-rail">
      <RailFrame>
        <RailDecisionSummary
          status={assist.status}
          primary={assist.decision}
          risk={assist.risk}
          next={assist.next}
          labels={{ primary: "Needs you" }}
        />
        <div className="rd-v2-rail-scroll">
          <RailFieldGrid>
            <RailField label="Target grain" value={brief.targetGrain || state.required_grain || "Not stated"} />
            <RailField label="Evidence" value={evidence} />
            <RailField label="Measured" value={measurement} />
            <RailField label="Method" value={method} />
            <RailField label="Output" value="Not registered" />
          </RailFieldGrid>
        </div>
        <RailStickyFooter>
          {typeof onAsk === "function" ? (
            <button type="button" className="rd-v2-btn" onClick={() => onAsk(assist.prompts[0])}>
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
  const preview = synthesisPreviewTruth(thread);
  const assist = synthesisAssist(thread);
  const queryReady = status === "query_ready" || thread?.materialisation === "query_ready";
  const registered = queryReady || status === "registered" || thread?.materialisation === "registered";
  const outputId = execution.output_dataset_id || state.execution_spec?.output_dataset_id || "";
  const summary = railSummary(thread);
  const sources = evidenceNodes(thread)
    .map((node) => node.label || node.dataset_id)
    .filter(Boolean);
  const specInput = state.execution_spec?.input_dataset_id || state.proposal?.execution_spec?.input_dataset_id || "";
  const evidenceValue = sources.length
    ? `${sources.length} mapped inputs`
    : specInput
      ? `Declared input · ${state.execution_spec ? "accepted" : "proposed"}: ${specInput}`
      : "No inputs mapped";
  const previewRows = Number(preview.preview?.sampling?.previewed_rows);
  const previewValue = !state.execution_spec
    ? "Not available"
    : preview.succeeded
      ? Number.isFinite(previewRows) ? `Passed · ${previewRows.toLocaleString()} rows` : "Passed"
      : preview.failed
        ? "Failed"
        : preview.stale
          ? "Stale · rerun required"
          : "Required";
  const executionValue = status === "spec_accepted"
    ? "Not requested"
    : execution.status || (state.execution_spec ? "Not requested" : "Not specified");
  const target = {
    kind: "synthesis_thread",
    id: thread?.id,
    title: thread?.title || state.title || "Synthesis thread",
    thread,
  };
  const ask = onAskAbout ? (prompt) => onAskAbout(target, prompt) : null;

  if (thread?.ephemeral || state.ephemeral) {
    return <NewEntryRail onAsk={ask} />;
  }

  if (isPreAcceptance(thread)) {
    return <OpeningThreadRail thread={thread} onAsk={ask} />;
  }

  return (
    <RailFrame>
      <RailDecisionSummary {...summary} labels={{ primary: summary.primaryLabel }} />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          <RailField label="Stage" value={assist.label} />
          <RailField label="Grain" value={state.required_grain || state.spec?.grain} />
          <RailField label="Evidence" value={evidenceValue} />
          <RailField label="Proposal" value={state.proposal?.title || "No proposal awaiting review"} />
          <RailField label="Preview" value={previewValue} />
          <RailField label="Execution" value={executionValue} />
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
        {typeof ask === "function" ? (
          <button type="button" className="rd-v2-btn" onClick={() => ask(assist.prompts[0])}>
            Ask about this decision
          </button>
        ) : null}
      </RailStickyFooter>
    </RailFrame>
  );
}

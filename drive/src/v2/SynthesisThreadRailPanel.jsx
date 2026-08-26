import {
  RailDecisionSummary,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";
import { synthesisAssist } from "@/v2/synthesisAssist.js";
import { synthesisDraftBrief, synthesisDraftPrompt } from "@/v2/synthesisDraft.js";
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

function AssistPrompts({ prompts, onAsk }) {
  const useful = Array.isArray(prompts) ? prompts.filter(Boolean).slice(0, 3) : [];
  if (typeof onAsk !== "function" || !useful.length) return null;
  return (
    <section className="s04-rail-assist" aria-label="Contextual Synthesis assistance">
      <header><span>Ask can help now</span></header>
      {useful.map((prompt) => (
        <button type="button" key={prompt} onClick={() => onAsk(prompt)}>{prompt}</button>
      ))}
    </section>
  );
}

function NewEntryRail({ thread, onAsk }) {
  const draft = synthesisDraftBrief(thread?.objective || thread?.state?.objective || "");
  const status = !draft.objective ? "Draft entry" : draft.readyToCreate ? "Ready to create" : "Draft brief";
  const primary = !draft.objective
    ? "Describe the research object"
    : draft.readyToCreate
      ? "Review the brief before making it durable"
      : `Clarify ${draft.missing[0]?.label?.toLowerCase() || "the missing framing"}`;
  const risk = !draft.objective
    ? "A blank objective gives Ask nothing durable to ground"
    : draft.missing.length
      ? `${draft.missing.length} framing commitment${draft.missing.length === 1 ? " is" : "s are"} still unstated`
      : "No evidence or methodology has been chosen yet";
  const next = !draft.objective
    ? "State the research purpose or reuse a registered method"
    : draft.readyToCreate
      ? "Create the construction, then review held Library evidence"
      : "Complete the brief yourself or use Ask to sharpen it";

  return (
    <RailFrame>
      <RailDecisionSummary
        status={status}
        primary={primary}
        risk={risk}
        next={next}
        labels={{ primary: "Needs you" }}
      />
      <div className="rd-v2-rail-scroll">
        <section className="s04-draft-rail-brief" aria-label="Draft research brief checklist">
          <header>
            <span>Research brief</span>
            <strong>{draft.complete}/4 framed</strong>
          </header>
          {draft.objective ? (
            <p>{draft.objective}</p>
          ) : (
            <p className="is-empty">Your purpose will appear here while you write. Nothing is saved yet.</p>
          )}
          <ul>
            {draft.cues.map((cue) => (
              <li key={cue.id} className={cue.ready ? "is-ready" : ""}>
                <b aria-hidden="true">{cue.ready ? "✓" : "·"}</b>
                <span>
                  <strong>{cue.label}</strong>
                  <small>{cue.ready ? "Mentioned in draft" : `${cue.help} · e.g. ${cue.example}`}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <RailFieldGrid>
          <RailField label="State" value="Not saved" />
          <RailField label="Evidence" value="None selected" />
          <RailField label="Method" value="None proposed" />
          <RailField label="Execution" value="Unavailable before later approval" />
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        {typeof onAsk === "function" ? (
          <>
            <button type="button" className="rd-v2-btn primary" onClick={() => onAsk(synthesisDraftPrompt(draft.objective))}>
              Help frame this in Ask
            </button>
            {draft.objective ? (
              <button
                type="button"
                className="rd-v2-btn"
                onClick={() => onAsk(`Challenge this unsaved research-object framing before it becomes durable: ${draft.objective}. Identify the single most consequential ambiguity in construct, unit, period, or intended use. Do not choose evidence or methodology.`)}
              >
                Challenge the framing
              </button>
            ) : null}
          </>
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
  const objective = String(thread?.objective || state.objective || brief.purpose || "").trim();
  const period = brief.targetPeriod || state.target_period || state.spec?.period || "Not stated";
  const intendedUse = brief.intendedUse || state.intended_use || state.spec?.intended_use || "Not stated";

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
          <section className="s04-rail-context" aria-label="Recorded research object">
            <header><span>Research object</span></header>
            <p>{objective || "No durable objective recorded."}</p>
            <dl>
              <div><dt>Grain</dt><dd>{brief.targetGrain || state.required_grain || "Not stated"}</dd></div>
              <div><dt>Period</dt><dd>{period}</dd></div>
              <div><dt>Intended use</dt><dd>{intendedUse}</dd></div>
            </dl>
          </section>
          <RailFieldGrid>
            <RailField label="Target grain" value={brief.targetGrain || state.required_grain || "Not stated"} />
            <RailField label="Evidence" value={evidence} />
            <RailField label="Measured" value={measurement} />
            <RailField label="Method" value={method} />
            <RailField label="Output" value="Not registered" />
          </RailFieldGrid>
          <AssistPrompts prompts={assist.prompts} onAsk={onAsk} />
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

function AuthorityProof({ state, status, preview, outputId, registered, queryReady }) {
  const hasMethod = Boolean(state.execution_spec);
  const executionStarted = !["", "spec_accepted", "pending_approval"].includes(status);
  const resultRecorded = registered || Boolean(state.execution?.manifest_id);
  const previewText = preview.succeeded
    ? "Passed for current revision"
    : preview.failed
      ? "Failed"
      : preview.stale
        ? "Stale · rerun required"
        : "Required";
  const executionText = status === "spec_accepted"
    ? "Not requested"
    : status === "pending_approval"
      ? "Awaiting researcher approval"
      : executionStarted
        ? `Recorded · ${status || "execution"}`
        : "Not recorded";
  const resultText = queryReady
    ? "Query-ready in Library"
    : registered
      ? "Registered in Library"
      : outputId
        ? "Declared · not registered"
        : "Not registered";
  return (
    <section className="s04-rail-proof" aria-label="Synthesis authority proof">
      <header><span>Authority proof</span></header>
      <ul>
        <li className={hasMethod ? "is-done" : ""}><span>Method</span><strong>{hasMethod ? "Accepted revision" : "Not accepted"}</strong></li>
        <li className={preview.succeeded ? "is-done" : "is-current"}><span>Preview</span><strong>{previewText}</strong></li>
        <li className={executionStarted ? "is-done" : "is-current"}><span>Execution</span><strong>{executionText}</strong></li>
        <li className={resultRecorded ? "is-done" : ""}><span>Result</span><strong>{resultText}</strong></li>
      </ul>
    </section>
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
    return <NewEntryRail thread={thread} onAsk={ask} />;
  }

  if (isPreAcceptance(thread)) {
    return <OpeningThreadRail thread={thread} onAsk={ask} />;
  }

  return (
    <RailFrame>
      <RailDecisionSummary {...summary} labels={{ primary: summary.primaryLabel }} />
      <div className="rd-v2-rail-scroll">
        <AuthorityProof
          state={state}
          status={status}
          preview={preview}
          outputId={outputId}
          registered={registered}
          queryReady={queryReady}
        />
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
        <AssistPrompts prompts={assist.prompts} onAsk={ask} />
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

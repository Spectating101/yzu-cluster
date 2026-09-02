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
  const unmeasured = Array.isArray(state.unmeasured) ? state.unmeasured : [];
  const flaggedProfiles = profiles.filter((profile) => Array.isArray(profile?.flags) && profile.flags.length);
  const countFlag = (flag) => profiles.filter((profile) => (profile?.flags || []).includes(flag)).length;
  const measuredInputs = Number(state.measured_inputs || 0);
  const joinReview = Boolean((Array.isArray(state.join_candidates) && state.join_candidates.length) || state.multi_overlap);
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
  const gates = [
    ["Objective", objective ? "Recorded" : "Missing", Boolean(objective)],
    ["Evidence", nodes.length ? `${nodes.length} mapped` : "Waiting", Boolean(nodes.length)],
    ["Measurement", profiles.length ? `${profiles.length} profiled` : "Not checked", Boolean(profiles.length)],
    ["Scope", state.scope_block ? "Decision needed" : profiles.length ? "No blocker" : "Not checked", profiles.length && !state.scope_block],
    ["Units", state.unit_conflict ? "Decision needed" : profiles.length ? "No blocker" : "Not checked", profiles.length && !state.unit_conflict],
    ["Join", joinReview ? "Review needed" : profiles.length ? "No blocker" : "Not checked", profiles.length && !joinReview],
    ["Method", proposal ? "Proposal ready" : recommendation.present ? "Recommendation" : "Not proposed", Boolean(proposal)],
  ];

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

          <section className="s04-rail-gates" aria-label="Synthesis readiness ledger">
            <header><span>Readiness ledger</span><strong>{gates.filter((gate) => gate[2]).length}/{gates.length}</strong></header>
            <ul>
              {gates.map(([label, value, ready]) => (
                <li key={label} className={ready ? "is-ready" : value.includes("needed") ? "is-blocked" : ""}>
                  <span>{label}</span><strong>{value}</strong>
                </li>
              ))}
            </ul>
          </section>

          {nodes.length ? (
            <section className="s04-rail-evidence-ledger" aria-label="Mapped evidence ledger">
              <header><span>Mapped evidence</span><strong>{nodes.length}</strong></header>
              <ul>
                {nodes.slice(0, 6).map((node, index) => (
                  <li key={node.id || node.dataset_id || `${node.label}-${index}`}>
                    <b>{node.label || node.dataset_id || node.id || `Input ${index + 1}`}</b>
                    <span>{[node.role, node.grain, node.coverage].filter(Boolean).join(" · ") || node.detail || "Held Library evidence"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : recommendation.present && recommendation.nodes.length ? (
            <section className="s04-rail-evidence-ledger is-planned" aria-label="Recommended evidence roles">
              <header><span>Evidence roles</span><strong>{recommendation.nodes.length}</strong></header>
              <ul>
                {recommendation.nodes.slice(0, 6).map((node, index) => (
                  <li key={node.id || `${node.label}-${index}`}>
                    <b>{node.label || node.role || `Role ${index + 1}`}</b>
                    <span>{[node.role, node.grain].filter(Boolean).join(" · ") || node.detail || "Recommended · not mapped"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {profiles.length || unmeasured.length ? (
            <section className="s04-rail-measurement" aria-label="Measured evidence diagnostics">
              <header><span>Measurement diagnostics</span><strong>Held bytes</strong></header>
              <dl>
                <div><dt>Inputs</dt><dd>{measuredInputs || nodes.length}</dd></div>
                <div><dt>Columns</dt><dd>{profiles.length}</dd></div>
                <div><dt>Flagged</dt><dd>{flaggedProfiles.length}</dd></div>
                <div><dt>Unread</dt><dd>{unmeasured.length}</dd></div>
                <div><dt>Look-ahead</dt><dd>{countFlag("lookahead")}</dd></div>
                <div><dt>Sparse</dt><dd>{countFlag("sparse")}</dd></div>
                <div><dt>Scale twins</dt><dd>{countFlag("unit_twin")}</dd></div>
              </dl>
            </section>
          ) : null}

          <RailFieldGrid>
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
    <section
      className="s04-rail-proof"
      aria-label="Synthesis authority proof"
      title="Method acceptance, bounded Preview, execution authority, and registered result are recorded separately."
    >
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
          <RailField label="Grain" value={state.required_grain || state.spec?.grain} />
          <RailField label="Evidence" value={evidenceValue} />
          <RailField label="Proposal" value={state.proposal?.title || "No proposal awaiting review"} />
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

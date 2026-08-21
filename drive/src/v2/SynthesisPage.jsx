import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageShell } from "@/v2/ui";
import {
  createSynthesisThread,
  decideSynthesisProposal,
  getSynthesisDiscoverHandoff,
  getSynthesisThread,
  listSynthesisProfiles,
  listSynthesisThreads,
  requestSynthesisExecution,
} from "@/v2/api";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";
import { DeskError } from "@/v2/DeskError";
import { ExcursionRecordPanel } from "./ExcursionRecordPanel.jsx";
import { focusFor } from "./synthesisFocus.js";
import "./s04-opening.css";

// The record renders whether or not it leads, so the strip must not offer it too.
const RECORD_ALWAYS = ["columns", "excursions", "settled", "provenance", "reuse"];
import { JoinDecisionPanel } from "./JoinDecisionPanel.jsx";
import { MethodSurfacePanel } from "./MethodSurfacePanel.jsx";
import { ProvenancePanel } from "./ProvenancePanel.jsx";
import { ReusePanel } from "./ReusePanel.jsx";
import { ScopePanel } from "./ScopePanel.jsx";
import { SettledDecisionsPanel } from "./SettledDecisionsPanel.jsx";
import { UnitConflictPanel } from "./UnitConflictPanel.jsx";
import {
  buildStageDetail,
  executionTrack,
  synthesisShowsEvidenceMap,
  synthesisShowsStageStrip,
} from "@/v2/synthesisLifecycle";

import {
  EXPLORATION_READY,
  isPreAcceptance,
  recommendedConstruction,
  researchBrief,
} from "@/v2/synthesisBrief.js";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

// An unbroken "grounding Library evidence" claim would run forever if the
// agent's turn never lands. Bounding it keeps the happy path (agent responds
// in seconds) untouched while giving a genuine stall an honest fallback
// instead of silent, indefinite optimism.
const INTERPRETING_STALL_MS = 60000;

function titleFor(thread) {
  return text(thread?.title || thread?.state?.title, "Untitled synthesis");
}

function titleFromObjective(value) {
  const cleaned = text(value)
    .replace(/\(dataset_id\s+[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const construction = cleaned.match(
    /\b(?:build|construct|create|derive|assemble)\s+(?:(?:a|an|the)\s+)?([^.!?]{8,96})/i,
  );
  let title = text(construction?.[1] || cleaned.split(/[.!?]/)[0], "Untitled synthesis")
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title.length > 72 ? `${title.slice(0, 69).trimEnd()}…` : title;
}

function stateFor(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const lifecycle = text(execution.status || thread?.materialisation).toLowerCase().replace(/-/g, "_");
  if (lifecycle === "query_ready") return "query_ready";
  if (lifecycle === "registered") return "registered";
  if (lifecycle === "failed") return "failed";
  // An accepted method sets execution_spec before execution.status ever
  // exists, and often before any evidence node is mapped either — the same
  // gap a brand-new thread sits in. Without this check, mode falls through
  // to "draft" while showExecution (which checks execution_spec directly)
  // is already true, and DraftCanvas renders stacked underneath the
  // execution record on the same thread.
  if (execution.status || state.execution_spec) return "execution";
  if (state.proposal) return "proposal";
  if ((state.nodes || []).length) return "explore";
  return "draft";
}

function initialGroundingIsPending(thread) {
  const state = thread?.state || {};
  return (
    stateFor(thread) === "draft"
    && text(state.lastActivity).toLowerCase() === "thread created."
  );
}

function stageLabel(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const mode = stateFor(thread);
  // Spec §5: before a construction is accepted the label stays restrained.
  if (isPreAcceptance(thread)) return EXPLORATION_READY;
  if (mode === "query_ready") return "Query-ready output";
  if (mode === "registered") return "Registered output";
  if (mode === "failed") return "Execution failed";
  if (mode === "execution") {
    return execution.status
      ? text(execution.status).replace(/_/g, " ")
      : text(state.maturityLabel || state.maturity, "Accepted method");
  }
  if (mode === "proposal") return "Proposal needs review";
  return text(state.maturityLabel || state.maturity, mode === "draft" ? "New thread" : "Evidence mapping");
}

function evidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function targetNode(thread) {
  return (thread?.state?.nodes || []).find((node) => node?.layer === "target" || node?.type === "target");
}

function threadStatus(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const mode = stateFor(thread);
  if (mode === "query_ready") return "Query ready";
  if (mode === "registered") return "Registered";
  if (mode === "failed") return "Needs recovery";
  if (execution.status) return text(execution.status).replace(/_/g, " ");
  if (state.proposal) return "Review proposal";
  return text(state.maturityLabel || state.maturity, "Exploring");
}

function threadOutput(thread) {
  const state = thread?.state || {};
  return state.execution?.output_dataset_id || state.execution_spec?.output_dataset_id || "";
}

const SYNTHESIS_STAGES = [
  ["Define", "Research object"],
  ["Ground", "Library evidence"],
  ["Review", "Method decision"],
  ["Build", "Execution record"],
  ["Reuse", "Library asset"],
];

function synthesisStageIndex(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const mode = stateFor(thread);
  if (mode === "registered" || mode === "query_ready") return 4;
  if (execution.status || state.execution_spec) return 3;
  if (state.proposal) return 2;
  if ((state.nodes || []).length) return 1;
  return 0;
}

function SynthesisProgress({ thread }) {
  const active = synthesisStageIndex(thread);
  const buildDetail = buildStageDetail(thread);
  return (
    <ol className="s04-steps" aria-label="Synthesis project stages">
      {SYNTHESIS_STAGES.map(([label, detail], index) => (
        <li key={label} className={index < active ? "done" : index === active ? "now" : ""}>
          <span>{index < active ? "✓" : index + 1}</span>
          <b>{label}</b>
          <small>{label === "Build" ? buildDetail : detail}</small>
        </li>
      ))}
    </ol>
  );
}

function SynthesisSidebarPortal({ children }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    const findTarget = () => {
      const next = document.getElementById("rd-v2-synthesis-sidebar-slot");
      if (next) {
        if (!cancelled) setTarget(next);
        return;
      }
      frame = requestAnimationFrame(findTarget);
    };
    findTarget();
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return target ? createPortal(children, target) : null;
}

function ThreadList({ threads, selectedId, loading, onSelect, onNew }) {
  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const activeThreads = threads.filter((thread) => !["registered", "query_ready"].includes(stateFor(thread)));
  const registeredThreads = threads.filter((thread) => ["registered", "query_ready"].includes(stateFor(thread)));

  function renderThread(thread) {
    return (
      <button
        type="button"
        key={thread.id}
        ref={thread.id === selectedId ? selectedRef : null}
        className={thread.id === selectedId ? "active" : ""}
        onClick={() => onSelect(thread.id)}
        data-testid="synthesis-thread-item"
      >
        <b>{["registered", "query_ready"].includes(stateFor(thread)) ? "✓" : stateFor(thread) === "failed" ? "!" : "S"}</b>
        <span>
          <strong>{titleFor(thread)}</strong>
          <small>{threadStatus(thread)}</small>
        </span>
      </button>
    );
  }

  return (
    <section className="s04-threads s04-threads--sidebar" aria-label="Synthesis threads">
      <header>
        <div className="s04-thread-heading">
          <span>Active work</span>
          <small>{loading ? "Loading" : `${activeThreads.length} active`}</small>
        </div>
        <button type="button" className="s04-thread-new" onClick={onNew}>+ New synthesis</button>
      </header>
      <div className="s04-thread-list">
        {activeThreads.map(renderThread)}
        {!loading && !activeThreads.length ? <p className="s04-thread-empty">No active constructions.</p> : null}
      </div>
      <section className="s04-thread-outputs" aria-label="Registered outputs">
        <small>Registered outputs</small>
        {registeredThreads.map(renderThread)}
        {!loading && !registeredThreads.length ? <p>No registered outputs.</p> : null}
      </section>
    </section>
  );
}

function ThreadPicker({ threads, selectedId, onSelect }) {
  if (threads.length < 2) return null;
  return (
    <label className="s04-thread-picker">
      <span>Active work</span>
      <select
        aria-label="Choose Synthesis thread"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {threads.map((thread) => (
          <option key={thread.id} value={thread.id}>{titleFor(thread)}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Spec §6. The brief states the construct in the researcher's own terms and the
 * three commitments a recommendation is answerable to. A commitment the desk has
 * not been told reads "Not stated" — the spec's opening state claims the intent
 * was understood, and a blank slot would claim that falsely.
 */
function ResearchBrief({ thread, onEditIntent }) {
  const brief = researchBrief(thread);
  if (!brief.body && !brief.targetGrain && !brief.targetPeriod && !brief.intendedUse) return null;
  return (
    <section className="s04-opening-brief" aria-label="Research brief">
      <header>
        <small>Research brief</small>
        {brief.editable ? (
          <button type="button" onClick={() => onEditIntent?.()}>Edit intent</button>
        ) : null}
      </header>
      {brief.body ? <p>{brief.body}</p> : null}
      <dl>
        <div>
          <dt>Target grain</dt>
          <dd className={brief.targetGrain ? "" : "unstated"}>{text(brief.targetGrain, "Not stated")}</dd>
        </div>
        <div>
          <dt>Target period</dt>
          <dd className={brief.targetPeriod ? "" : "unstated"}>{text(brief.targetPeriod, "Not stated")}</dd>
        </div>
        <div>
          <dt>Intended use</dt>
          <dd className={brief.intendedUse ? "" : "unstated"}>{text(brief.intendedUse, "Not stated")}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Spec §6. One construction is recommended and the alternatives stay counted but
 * collapsed. Before the first reasoning turn, the canvas must offer a real
 * transition into Ask rather than looking like a completed but inert demo.
 */
function OpeningRoleMap({ recommendation }) {
  const output = recommendation.expectedOutput.label || recommendation.title;
  return (
    <figure className="s04-opening-map" aria-label="Recommended construction evidence roles">
      <figcaption>Evidence roles</figcaption>
      <ol>
        {recommendation.nodes.map((node) => (
          <li key={node.id || node.source}>
            <small>{text(node.role, "Role not stated")}</small>
            <strong>{node.source}</strong>
            <span>{text(node.grain, "Grain not stated")}</span>
          </li>
        ))}
      </ol>
      <div className="s04-opening-map-flow" aria-hidden="true">
        <span />
        <b>↓</b>
        <span />
      </div>
      <div className="s04-opening-map-output">
        <small>Expected output</small>
        <strong>{output}</strong>
        {recommendation.expectedOutput.grain || recommendation.expectedOutput.period ? (
          <span>
            {[recommendation.expectedOutput.grain, recommendation.expectedOutput.period].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
      {recommendation.validationRole ? (
        <p><b>Validate against</b>{recommendation.validationRole}</p>
      ) : null}
    </figure>
  );
}

function ConstructionFacts({ recommendation }) {
  const facts = [
    recommendation.idealDirectMeasure.label ? [
      "Ideal direct measure",
      recommendation.idealDirectMeasure.label,
      recommendation.idealDirectMeasure.why ? `Unavailable · ${recommendation.idealDirectMeasure.why}` : "",
    ] : null,
    recommendation.aiResolved.length ? ["AI has resolved", recommendation.aiResolved.join(" · "), ""] : null,
    recommendation.methodWillResolve.length ? ["Method design will resolve", recommendation.methodWillResolve.join(" · "), ""] : null,
  ].filter(Boolean);
  if (!facts.length) return null;
  return (
    <dl className="s04-opening-facts">
      {facts.map(([label, value, note]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}{note ? <em>{note}</em> : null}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecommendedConstruction({ thread, onCompare }) {
  const rec = recommendedConstruction(thread);
  if (!rec.present) {
    return (
      <section className="s04-opening-construction s04-opening-construction--empty" aria-label="Recommended construction">
        <header>
          <small>Recommended construction</small>
        </header>
        <p>
          No construction has been recommended yet. Start a reasoning turn to ground one
          reviewable proposal in this brief and the recorded Library evidence.
        </p>
      </section>
    );
  }
  return (
    <section className="s04-opening-construction" aria-label="Recommended construction">
      <header>
        <small>Recommended construction</small>
        <em>Recommended</em>
      </header>
      <h2>{rec.title}</h2>
      <OpeningRoleMap recommendation={rec} />
      <ConstructionFacts recommendation={rec} />
      {rec.alternatives ? (
        <button type="button" className="s04-opening-alternatives" onClick={() => onCompare?.()}>
          {rec.alternatives} alternative constructions available <b>▸</b>
        </button>
      ) : null}
    </section>
  );
}

/**
 * Spec §6. The opening state closes by saying what accepting does — and, more
 * importantly, what it does not do. The footer line is the spec's own: an AI
 * recommendation is ready and nothing has been built or modified.
 *
 * Both actions stay disabled until a construction exists to act on. A button
 * that looks live and does nothing is worse than one that says why it cannot.
 */
function WhatHappensNext({ thread, onCompare, onAccept, onStartReasoning, reasoningPending = false }) {
  const rec = recommendedConstruction(thread);
  const hasRecommendation = rec.present;
  return (
    <section className="s04-opening-next" aria-label="What happens next">
      <header>
        <small>What happens next</small>
      </header>
      <p>
        {hasRecommendation
          ? "Accepting a construction will not build data. The desk will draft the detailed method and surface only the choices that materially change the output."
          : reasoningPending
            ? "Ask is grounding one reviewable construction in this brief and the recorded Library evidence. It will not collect, execute, or change data."
            : "Start a reasoning turn to request one reviewable construction. It may clarify a decisive gap first; it will not collect, execute, or change data."}
      </p>
      <footer>
        <button
          type="button"
          className="s04-next-secondary"
          disabled={!rec.alternatives}
          onClick={() => onCompare?.()}
        >
          Compare alternatives
        </button>
        <button
          type="button"
          className="s04-next-primary"
          disabled={hasRecommendation ? false : reasoningPending || !onStartReasoning}
          onClick={() => (hasRecommendation ? onAccept?.() : onStartReasoning?.())}
          >
          {hasRecommendation
            ? "Accept & design method"
            : reasoningPending
              ? "Method reasoning in Ask"
              : "Start method reasoning"}
        </button>
      </footer>
      <em>
        {hasRecommendation
          ? "AI recommendation ready · nothing built or modified"
          : reasoningPending
            ? "Waiting for a reviewable proposal · nothing built or modified"
            : "A proposal will be reviewable before any method or data changes"}
      </em>
    </section>
  );
}

function ThreadHeader({ thread, onEditIntent }) {
  const state = thread?.state || {};
  // Spec §6: the opening state is the brief. The objective paragraph and the
  // record strip both restate what the brief already says, so they wait.
  const opening = isPreAcceptance(thread);
  const execution = state.execution || {};
  const mode = stateFor(thread);
  const queryReady = mode === "query_ready";
  const registered = mode === "registered" || queryReady;
  return (
    <>
      <header className="s04-head">
        <div>
          <small>{stageLabel(thread)}</small>
          <h1>{titleFor(thread)}</h1>
          {opening ? null : (
            <p>{text(thread?.objective || state.objective, "A durable research-construction thread.")}</p>
          )}
        </div>
        <em>
          {queryReady
            ? "Query-ready evidence"
            : registered
              ? "Registered evidence"
              : execution.status
              ? "Durable execution state"
              : state.proposal
                ? "Reviewable change"
                : "Nothing registered"}
        </em>
      </header>
      <ResearchBrief thread={thread} onEditIntent={onEditIntent} />
      {opening ? null : (
      <div className="s04-brief">
        <span>
          <small>Current record</small>
          {text(state.lastActivity, "No method or output claim has been recorded yet.")}
        </span>
        <span className="s04-brief-grain">
          <small>Required grain</small>
          {text(state.required_grain || state.spec?.grain, "Not specified")}
        </span>
      </div>
      )}
      {synthesisShowsStageStrip(thread) ? <SynthesisProgress thread={thread} /> : null}
    </>
  );
}

function evidenceNodeId(node) {
  return String(node?.id || node?.dataset_id || "");
}

// A node's own `status` string is display text the backend chose, not a
// judgment the UI should re-derive meaning from. Routability to Discover is
// decided only by whether the durable discover-handoff endpoint explicitly
// names this node's identity as missing evidence (the backend's own
// HELD_STATUSES/MISSING_STATUSES classification) — never by pattern-matching
// that status locally. No handoff yet, or a failed fetch, means no routing
// affordance, not a guessed gap.
function isEvidenceGap(node, missingIds) {
  const id = evidenceNodeId(node);
  return Boolean(id) && Boolean(missingIds?.has(id));
}

function EvidenceMap({ thread, onAsk, selectedField, onSelectField, onRouteToDiscover, missingIds }) {
  const target = targetNode(thread);
  const evidence = evidenceNodes(thread);
  const state = thread?.state || {};
  const missing = evidence.filter((node) => isEvidenceGap(node, missingIds));
  return (
    <section className="s04-card" data-testid="synthesis-evidence-state">
      <header className="s04-title">
        <div>
          <small>Evidence map</small>
          <h2>{text(target?.label, "Research construction")}</h2>
        </div>
        <em className="neutral">{evidence.length ? `${evidence.length} mapped inputs` : "No inputs mapped"}</em>
      </header>
      <div className="s04-map" role="group" aria-label="The current Synthesis evidence map">
        <div className="sources">
          {evidence.length ? (
            evidence.slice(0, 6).map((node) => (
              <button
                type="button"
                key={node.id || node.label}
                className={`s04-map-node${selectedField?.id === node.id ? " selected" : ""}`}
                onClick={() => onSelectField?.(node)}
                aria-pressed={selectedField?.id === node.id}
              >
                <small>{text(node.role || node.eyebrow || node.status, "Evidence")}</small>
                <strong>{text(node.label || node.dataset_id, "Unnamed evidence")}</strong>
                <span>{[node.grain, node.coverage].filter(Boolean).join(" · ") || "Metadata not reported"}</span>
              </button>
            ))
          ) : (
            <article className="s04-empty-evidence">
              <small>Next</small>
              <strong>Map evidence with Ask</strong>
              <span>No source relationship has been persisted.</span>
            </article>
          )}
        </div>
        <b>↓</b>
        {state.spec?.summary || state.spec?.method ? (
          <>
            <span className="process">{text(state.spec.summary || state.spec.method, "Method detail not reported")}</span>
            <b>↓</b>
          </>
        ) : null}
        <strong className="target">{text(target?.label, text(thread?.objective, "Research objective"))}</strong>
      </div>
      <div className="s04-pairs">
        <article>
          <small>Research object</small>
          <strong>{text(thread?.objective || state.objective, "Not reported")}</strong>
          <p>{text(target?.interpretation, "Ask can refine the object before a method proposal is accepted.")}</p>
        </article>
        <article>
          <small>Unresolved evidence</small>
          <strong>{missing.length ? `${missing.length} source decision${missing.length === 1 ? "" : "s"} remain` : "No missing source is recorded"}</strong>
          <p>{missing.length ? missing.map((node) => node.label || node.dataset_id).filter(Boolean).join(" · ") : "This is not a claim of complete coverage."}</p>
        </article>
      </div>
      {selectedField ? (
        <section className="s04-selected-field" data-testid="synthesis-selected-field">
          <div>
            <small>Selected evidence</small>
            <strong>{text(selectedField.label || selectedField.dataset_id, "Unnamed evidence")}</strong>
            <p>{text(selectedField.interpretation || selectedField.status, "No evidence interpretation has been recorded.")}</p>
          </div>
          <div>
            <button
              type="button"
              className="rd-v2-btn"
              onClick={() => onAsk(`Inspect ${text(selectedField.label || selectedField.dataset_id)} in this construction. State what it establishes, what remains unknown, and the valid next method decision.`)}
            >
              Inspect in Ask
            </button>
            {isEvidenceGap(selectedField, missingIds) ? (
              <button type="button" className="rd-v2-btn primary" onClick={() => onRouteToDiscover?.(selectedField)}>
                Route to Discover
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      <footer className="s04-actions">
        <p>
          <small>Next</small>
          Ask proposes reviewable changes. It cannot silently accept a method or register an output.
        </p>
        <button type="button" className="rd-v2-btn primary" onClick={() => onAsk("Explain the current evidence map and identify the next material research decision.")}>
          Discuss construction in Ask
        </button>
      </footer>
    </section>
  );
}

function metricLabel(metric) {
  const fn = text(metric?.function || metric?.aggregate, "metric");
  const column = text(metric?.column || metric?.field);
  const alias = text(metric?.as || metric?.name);
  const expression = column ? `${fn}(${column})` : fn;
  return alias && alias !== expression ? `${alias} ← ${expression}` : expression;
}

function softIdentifier(value, fallback = "Not reported") {
  return text(value, fallback).replace(/([_/.-])/g, "$1\u200b");
}

const PROPOSAL_OPERATION_LABELS = {
  add_node: "Add evidence or a derived construct",
  add_edge: "Link evidence to the research target",
  update_spec: "Update the construction method",
  append_activity: "Record this proposal in project history",
  remove_node: "Remove mapped evidence or a construct",
  remove_edge: "Remove an evidence relationship",
};

function proposalOperationLabel(operation) {
  const kind = text(operation?.op || operation?.type).toLowerCase();
  return text(
    operation?.summary || operation?.label || PROPOSAL_OPERATION_LABELS[kind],
    kind ? kind.replace(/_/g, " ") : "Structured state change",
  );
}

function ProposalReview({ thread, busy, onDecide, onAsk }) {
  const state = thread?.state || {};
  const proposal = state.proposal || {};
  const spec = proposal.execution_spec || {};
  const operations = Array.isArray(proposal.operations) ? proposal.operations : [];
  const metrics = Array.isArray(spec.metrics) ? spec.metrics : [];
  const groupBy = Array.isArray(spec.group_by) ? spec.group_by : [];
  const limitations = (
    Array.isArray(state.spec?.limitations)
      ? state.spec.limitations
      : Array.isArray(state.limitations)
        ? state.limitations
        : []
  ).filter(Boolean);
  const unknowns = (
    Array.isArray(state.spec?.unavailable)
      ? state.spec.unavailable
      : Array.isArray(state.unavailable)
        ? state.unavailable
        : []
  ).filter(Boolean);
  const canDecide = Boolean(proposal.id && proposal.proposal_hash);
  return (
    <section className="s04-card s04-proposal-card" data-testid="synthesis-proposal-state">
      <header className="s04-title">
        <div>
          <small>Review proposed change</small>
          <h2>{text(proposal.title, "Untitled proposal")}</h2>
        </div>
        <em className={proposal.execution_preflight?.ok ? "success" : "warn"}>
          {proposal.execution_preflight?.ok ? "Preflight passed · review required" : "Review required"}
        </em>
      </header>
      <p className="s04-proposal-summary">
        {text(proposal.summary, "The agent proposed a change to this durable construction.")}
      </p>
      {proposal.execution_spec ? (
        <div className="s04-method-flow" aria-label="Proposed construction pipeline">
          <article>
            <small>Held input</small>
            <strong>{softIdentifier(spec.input_dataset_id)}</strong>
            <span>Registered Library evidence</span>
          </article>
          <b aria-hidden="true">→</b>
          <article className="transform">
            <small>Construction</small>
            <strong>{groupBy.length ? `Group by ${groupBy.join(" + ")}` : "Aggregate all rows"}</strong>
            <div>
              {metrics.length
                ? metrics.slice(0, 5).map((metric, index) => <span key={`${metricLabel(metric)}-${index}`}>{metricLabel(metric)}</span>)
                : <span>Metric detail not reported</span>}
            </div>
          </article>
          <b aria-hidden="true">→</b>
          <article className="output">
            <small>Proposed output</small>
            <strong>{softIdentifier(spec.output_dataset_id)}</strong>
            <span>Nothing is materialised yet</span>
          </article>
        </div>
      ) : null}
      <div className="s04-review-grid">
        <section className="s04-resolved-list">
          <small>Exact change set</small>
          <ul>
            {operations.length ? (
              operations.slice(0, 8).map((operation, index) => (
                <li key={`${operation.op || operation.type || "change"}-${index}`}>
                  {proposalOperationLabel(operation)}
                </li>
              ))
            ) : (
              <li>No operation summary was returned. Inspect this proposal with Ask before deciding.</li>
            )}
          </ul>
        </section>
        <section className="s04-review-risks">
          <small>Still not established</small>
          {limitations.length || unknowns.length ? (
            <ul>
              {[...limitations, ...unknowns].slice(0, 5).map((item, index) => (
                <li key={`${text(item)}-${index}`}>{text(item)}</li>
              ))}
            </ul>
          ) : (
            <p>No additional limitation was recorded. Ask should still challenge construct validity before acceptance.</p>
          )}
        </section>
      </div>
      {!canDecide ? <p className="s04-fixture">This proposal has no revision hash, so it cannot be accepted from the desk. Refresh it through Ask.</p> : null}
      <footer className="s04-actions">
        <p>
          <small>Approval boundary</small>
          A decision is bound to this exact proposal revision. A changed proposal must be reviewed again.
        </p>
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Challenge this Synthesis proposal and explain every methodological consequence.")}>Challenge in Ask</button>
        <button type="button" className="rd-v2-btn" disabled={busy || !canDecide} onClick={() => onDecide("reject")}>Reject</button>
        <button type="button" className="rd-v2-btn primary" disabled={busy || !canDecide} onClick={() => onDecide("accept")}>Accept proposal</button>
      </footer>
    </section>
  );
}

function ExecutionRecord({ thread, busy, onRequest, onReview, onAsk, onOpenDataset }) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const spec = state.execution_spec || {};
  const rawStatus = text(execution.status).toLowerCase().replace(/-/g, "_");
  const status = text(execution.status, "not requested").replace(/_/g, " ");
  const outputId = threadOutput(thread);
  const mode = stateFor(thread);
  const queryReady = mode === "query_ready";
  const registered = mode === "registered" || queryReady;
  const failed = execution.status === "failed";
  const pendingApproval = rawStatus === "pending_approval";
  const active = ["queued", "running", "registering", "archiving"].includes(rawStatus);
  const hasSpec = Boolean(spec.input_dataset_id && spec.output_dataset_id);
  const track = executionTrack(rawStatus, registered, queryReady);

  return (
    <section className="s04-card" data-testid={queryReady ? "synthesis-query-ready-state" : registered ? "synthesis-registered-state" : failed ? "synthesis-failed-state" : "synthesis-execution-state"}>
      <header className="s04-title">
        <div>
          <small>{queryReady ? "Query-ready research asset" : registered ? "Registered research asset" : failed ? "Execution failed" : "Execution record"}</small>
          <h2>{registered ? softIdentifier(outputId, "Registered output") : softIdentifier(spec.output_dataset_id, "No execution requested")}</h2>
        </div>
        <em className={registered ? "success" : failed ? "warn" : "neutral"}>{queryReady ? "Query ready" : registered ? "Registered" : status}</em>
      </header>
      {hasSpec ? (
        <dl className="s04-method">
          <div><dt>Input</dt><dd>{softIdentifier(spec.input_dataset_id)}</dd></div>
          <div><dt>Output</dt><dd>{softIdentifier(spec.output_dataset_id)}</dd></div>
          <div><dt>Group by</dt><dd>{Array.isArray(spec.group_by) ? spec.group_by.join(" · ") : "Not reported"}</dd></div>
          <div><dt>Metrics</dt><dd>{Array.isArray(spec.metrics) ? `${spec.metrics.length} defined` : "Not reported"}</dd></div>
        </dl>
      ) : null}
      {hasSpec ? (
        <ol className="s04-exec-track" aria-label="Synthesis execution lifecycle">
          {track.map((step, index) => (
            <li key={step.label} className={step.state}>
              <b>{step.state === "done" ? "✓" : index + 1}</b>
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="s04-proof">
        <section>
          <small>Execution evidence</small>
          <dl>
            <div><dt>Job</dt><dd>{text(execution.job_id, "Not requested")}</dd></div>
            <div><dt>Rows</dt><dd>{execution.rows == null ? "Not reported" : Number(execution.rows).toLocaleString()}</dd></div>
            <div><dt>Manifest</dt><dd>{text(execution.manifest_id, "Not reported")}</dd></div>
          </dl>
        </section>
        <section>
          <small>Registration evidence</small>
          <dl>
            <div><dt>Archive</dt><dd>{execution.drive_verified ? "Reported verified" : "Not reported"}</dd></div>
            <div><dt>Registry</dt><dd>{queryReady ? "Query-ready output reported" : registered ? "Registered output reported" : "Not claimed"}</dd></div>
            <div><dt>Output</dt><dd>{softIdentifier(outputId, "Not registered")}</dd></div>
          </dl>
        </section>
      </div>
      {failed ? <p className="s04-fixture">{text(execution.error, "The execution failed without a recorded error detail.")}</p> : null}
      <footer className="s04-actions">
        <p>
          <small>Truth boundary</small>
          {queryReady
            ? "This asset is shown because the thread reports a query-ready output."
            : registered
              ? "This asset is shown because the thread reports a registered output; query readiness is not implied."
              : failed
              ? "The accepted specification remains inspectable; no output is claimed registered."
              : hasSpec
                ? "Requesting execution creates a durable job. Registration remains a separate verified outcome."
                : "An accepted execution specification is required before this thread can request a build."}
        </p>
        {registered ? (
          <button
            type="button"
            className="rd-v2-btn primary"
            onClick={() => onOpenDataset?.({
              dataset_id: outputId,
              name: outputId,
              analysis_readiness: queryReady ? "query_ready" : "registered",
            })}
          >
            Open in Library
          </button>
        ) : null}
        {!registered && hasSpec && !rawStatus ? <button type="button" className="rd-v2-btn primary" disabled={busy} onClick={onRequest}>Request execution</button> : null}
        {pendingApproval ? <button type="button" className="rd-v2-btn primary" onClick={() => onReview?.(execution)}>Review approval</button> : null}
        {active ? <span className="s04-live-note">This thread refreshes automatically.</span> : null}
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Explain the exact execution state and which evidence is still missing before this output can be trusted.")}>Ask about execution</button>
      </footer>
    </section>
  );
}

function DraftCanvas({ thread, onAsk, stalled, onRetry }) {
  const state = thread?.state || {};
  return (
    <section className="s04-card s04-draft" data-testid="synthesis-draft-state">
      <header className="s04-title">
        <div>
          <small>AI construction workspace</small>
          <h2>{stalled ? "Taking longer than expected" : "Interpretation in progress"}</h2>
        </div>
        <em className="neutral">{stalled ? "No response yet" : "Grounding Library evidence"}</em>
      </header>
      <div className="s04-draft-flow" role="img" aria-label="The first Synthesis reasoning steps">
        {/* The brief states the objective directly above; repeating it here made
            the same paragraph appear three times on one screen. */}
        {isPreAcceptance(thread) ? null : (
          <>
            <strong>{text(thread?.objective || state.objective, "Research objective")}</strong>
            <b>↓</b>
          </>
        )}
        <div>
          <article>
            <small>Interpret</small>
            <span>Define the latent construct</span>
          </article>
          <article>
            <small>Ground</small>
            <span>Map relevant Library evidence</span>
          </article>
          <article>
            <small>Challenge</small>
            <span>Name the decisive validity risk</span>
          </article>
        </div>
      </div>
      <footer className="s04-actions">
        <p>
          <small>Working agreement</small>
          {stalled
            ? "The agent hasn't responded yet. Nothing has been built or modified — you can keep waiting or check again now."
            : "Ask clarifies the construct one decision at a time. Nothing is executed or registered from this state."}
        </p>
        {stalled ? (
          <button type="button" className="rd-v2-btn" data-testid="synthesis-draft-retry" onClick={onRetry}>
            Check again
          </button>
        ) : null}
        <button
          type="button"
          className="rd-v2-btn primary"
          onClick={() => onAsk("Continue interpreting this construct. Show what is supported, proposed, and unresolved, then ask the one highest-value question.")}
        >
          Continue in Ask
        </button>
      </footer>
    </section>
  );
}

function NewThread({ objective, setObjective, busy, profiles, onCreate, onStartBlueprint }) {
  const startingPoints = (Array.isArray(profiles) ? profiles : []).slice(0, 3);
  return (
    <section className="s04-intent" data-testid="synthesis-intent-state">
      <small>Research object</small>
      <h2>Describe the construction you need.</h2>
      <p>State the research purpose in ordinary language. Ask returns a durable object, grounds it in Library evidence, and makes each proxy choice reviewable before a method can be accepted.</p>
      <textarea
        rows={7}
        value={objective}
        onChange={(event) => setObjective(event.target.value)}
        placeholder="Example: Build a weekly measure of stablecoin trust deterioration that separates security incidents, liquidity stress, and public attention…"
        onKeyDown={(event) => {
          handleEnterToSubmit(event, () => {
            if (!busy && objective.trim()) onCreate();
          });
        }}
      />
      <p className="s04-intent-boundary">
        No method exists yet. Ask can return an evidence map, proxy choices, and one reviewable
        decision; nothing executes or registers from this entry state.
      </p>
      {startingPoints.length ? (
        <div className="s04-intent-starts">
          <small>Or start from a registered method</small>
          <div>
            {startingPoints.map((profile) => (
              <button
                type="button"
                key={profile.id}
                disabled={busy}
                onClick={() => onStartBlueprint?.(profile)}
                title={text(profile.title, profile.id)}
              >
                <strong>{text(profile.title, profile.id)}</strong>
                <span>{text(profile.description, "Registered construction recipe")}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <footer>
        {/* VC-6: a disabled primary action must say why it is unavailable. */}
        <span>
          {objective.trim()
            ? "Creates a durable project, then opens Ask with this exact objective attached."
            : "Enter an objective to continue. Creates a durable project, then opens Ask with it attached."}
        </span>
        <button
          type="button"
          className="rd-v2-btn primary"
          disabled={busy || !objective.trim()}
          onClick={onCreate}
          title={objective.trim() ? undefined : "Enter an objective to continue"}
        >
          Start project in Ask
        </button>
      </footer>
    </section>
  );
}

function EmptyWorkspace({ profiles, profilesLoading, profilesError, onStartBlueprint, onNew }) {
  const list = Array.isArray(profiles) ? profiles : [];
  return (
    <section className="s04-intent s04-empty-canvas" data-testid="synthesis-empty-state">
      <small>Research construction</small>
      <h2>Start one durable research object.</h2>
      <p>
        A construction keeps the evidence map, method review, execution proof, and registered output on one thread.
        No method or output is claimed until the desk records it.
      </p>
      <div className="s04-empty-decisions">
        <article>
          <small>Start with</small>
          <strong>Research purpose</strong>
          <span>Ask turns it into a durable object and evidence map.</span>
        </article>
        <article>
          <small>Or reuse</small>
          <strong>Registered method</strong>
          <span>Begin from a recorded construction, then review any change.</span>
        </article>
      </div>
      {profilesLoading ? <p className="s04-fixture">Loading registered blueprints…</p> : null}
      {profilesError ? <DeskError raw={profilesError} surface="the registered methods" /> : null}
      {!profilesLoading && !profilesError && !list.length ? (
        <p className="s04-fixture">No registered method is reported on this desk yet.</p>
      ) : null}
      {list.length ? (
        <ul className="s04-blueprint-recipes" aria-label="Registered synthesis methods" data-testid="synthesis-blueprints">
          <li className="s04-blueprint-heading">Registered methods</li>
          {list.map((profile) => {
            const sources = Array.isArray(profile.sources) ? profile.sources : [];
            const joins = Array.isArray(profile.join_keys) ? profile.join_keys : [];
            const body =
              text(profile.description) ||
              (sources.length
                ? `Inputs: ${sources.map((s) => s.label || s.id).filter(Boolean).join(" · ")}`
                : "Registered construction recipe");
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  className="s04-blueprint-recipe"
                  data-testid="synthesis-blueprint"
                  onClick={() => onStartBlueprint?.(profile)}
                >
                  <strong>{text(profile.title, profile.id)}</strong>
                  <span>
                    {body}
                    {joins.length ? ` · join ${joins.join(", ")}` : ""}
                  </span>
                  <em>Open →</em>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <footer>
        <button type="button" className="rd-v2-btn primary" onClick={onNew}>
          Start a construction
        </button>
      </footer>
    </section>
  );
}

function ContextStrip({ items, onPromote, promoted, onClear }) {
  if (!items.length && !promoted) return null;
  return (
    <nav className="s04-strip" aria-label="Everything else this thread knows" data-testid="synthesis-strip">
      {promoted ? (
        <button type="button" className="s04-strip-item" onClick={onClear}>
          <b>back</b><span>to what needs you</span>
        </button>
      ) : null}
      {items.map((item) => (
        <button key={item.id} type="button" className="s04-strip-item" onClick={() => onPromote(item.id)}>
          <b>{item.label}</b><span>{item.summary}</span>
        </button>
      ))}
    </nav>
  );
}

export function SynthesisPage({
  onAskComposer,
  onOpenDataset,
  onReviewExecution,
  onSelectThread,
  onBeginNew,
  onDiscoverHandoff,
  focusThreadId,
  onFocusThreadConsumed,
  refreshVersion = 0,
}) {
  const [threads, setThreads] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newMode, setNewMode] = useState(false);
  const [objective, setObjective] = useState("");
  const [interpretingStalled, setInterpretingStalled] = useState(false);
  const [reasoningThreadId, setReasoningThreadId] = useState("");
  const [selectedField, setSelectedField] = useState(null);
  const [promoted, setPromoted] = useState("");
  const [missingEvidenceIds, setMissingEvidenceIds] = useState(() => new Set());
  const notified = useRef("");
  const interpretingSinceRef = useRef(null);
  const interpretingThreadIdRef = useRef("");

  const replaceThread = useCallback((next) => {
    if (!next?.id) return;
    setThreads((current) => {
      const present = current.some((thread) => thread.id === next.id);
      return present ? current.map((thread) => (thread.id === next.id ? next : thread)) : [next, ...current];
    });
  }, []);

  const refreshThreads = useCallback(async ({ keepLoading = false } = {}) => {
    if (!keepLoading) setLoading(true);
    setError("");
    try {
      const result = await listSynthesisThreads();
      const next = Array.isArray(result?.threads) ? result.threads : [];
      setThreads(next);
      setSelectedId((current) => {
        if (current && next.some((thread) => thread.id === current)) return current;
        const familiar = next.find((thread) => /stablecoin attention/i.test(titleFor(thread)));
        return familiar?.id || next[0]?.id || "";
      });
      if (!next.length) setNewMode(false);
    } catch (cause) {
      setError(text(cause?.message, "Synthesis threads could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    let cancelled = false;
    setProfilesLoading(true);
    setProfilesError("");
    listSynthesisProfiles()
      .then((result) => {
        if (cancelled) return;
        const next = Array.isArray(result?.profiles) ? result.profiles : [];
        setProfiles(next);
      })
      .catch((cause) => {
        if (cancelled) return;
        setProfiles([]);
        setProfilesError(text(cause?.message, "Registered blueprints could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setProfilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => threads.find((thread) => thread.id === selectedId) || null, [threads, selectedId]);
  const reasoningPending = Boolean(
    selected && (initialGroundingIsPending(selected) || reasoningThreadId === selected.id),
  );

  useEffect(() => {
    if (!selected) return;
    const key = `${selected.id}:${selected.updated_at || ""}:${selected.state?.execution?.status || ""}`;
    if (notified.current === key) return;
    notified.current = key;
    onSelectThread?.(selected);
  }, [selected, onSelectThread]);

  const refreshThread = useCallback(async (threadId = selectedId) => {
    if (!threadId) return null;
    const next = await getSynthesisThread(threadId);
    replaceThread(next);
    return next;
  }, [replaceThread, selectedId]);

  useEffect(() => {
    if (!refreshVersion || !selectedId) return;
    refreshThread(selectedId).catch(() => {});
  }, [refreshThread, refreshVersion, selectedId]);

  useEffect(() => {
    if (!selected) return undefined;
    const execution = selected?.state?.execution || {};
    const executing = /pending_approval|queued|running|registering|archiving/i.test(String(execution.status || ""));
    const interpreting = reasoningPending;

    // Stalling belongs to one durable thread. Selecting a different new
    // thread must start a fresh wait window rather than inheriting the
    // previous thread's "agent hasn't responded" state.
    const interpretingThreadId = selected?.id || "";
    if (!interpreting) {
      interpretingSinceRef.current = null;
      interpretingThreadIdRef.current = "";
      if (interpretingStalled) setInterpretingStalled(false);
    } else if (interpretingThreadIdRef.current !== interpretingThreadId) {
      interpretingThreadIdRef.current = interpretingThreadId;
      interpretingSinceRef.current = Date.now();
      if (interpretingStalled) setInterpretingStalled(false);
    }

    if (!executing && !interpreting) return undefined;
    // Once truly stalled, stop polling in the background — continuing to
    // poll silently would undercut the honest "this stalled" signal now
    // showing. A manual "Check again" click (retryInterpreting) re-arms it.
    if (interpreting && interpretingStalled) return undefined;

    const timer = window.setInterval(async () => {
      const next = await refreshThread().catch(() => null);
      const stillInterpreting = next ? stateFor(next) === "draft" : interpreting;
      if (
        stillInterpreting &&
        interpretingSinceRef.current &&
        Date.now() - interpretingSinceRef.current > INTERPRETING_STALL_MS
      ) {
        setInterpretingStalled(true);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [selected, refreshThread, interpretingStalled, reasoningPending]);

  useEffect(() => {
    if (!selected || stateFor(selected) === "draft") return;
    setReasoningThreadId((current) => (current === selected.id ? "" : current));
  }, [selected]);

  const retryInterpreting = useCallback(() => {
    interpretingThreadIdRef.current = selected?.id || "";
    interpretingSinceRef.current = Date.now();
    setInterpretingStalled(false);
    refreshThread().catch(() => {});
  }, [refreshThread, selected?.id]);

  const selectThread = async (threadId) => {
    setSelectedId(threadId);
    setNewMode(false);
    setSelectedField(null);
    setError("");
    try {
      const next = await refreshThread(threadId);
      if (next) onSelectThread?.(next);
    } catch (cause) {
      setError(text(cause?.message, "This Synthesis thread could not be refreshed."));
    }
  };

  useEffect(() => {
    if (!selected?.id || stateFor(selected) !== "explore") {
      setMissingEvidenceIds(new Set());
      return undefined;
    }
    let cancelled = false;
    getSynthesisDiscoverHandoff(selected.id)
      .then((handoff) => {
        if (cancelled) return;
        const ids = (handoff?.missing_evidence || [])
          .map((item) => String(item?.id || item?.evidence_id || item?.dataset_id || ""))
          .filter(Boolean);
        setMissingEvidenceIds(new Set(ids));
      })
      .catch(() => {
        // Unavailable or incomplete handoff means no routing affordance,
        // not a guessed gap — clear rather than leave a stale set.
        if (!cancelled) setMissingEvidenceIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.updated_at]);

  useEffect(() => {
    if (!focusThreadId) return;
    // Returning from a Discover handoff: select the exact originating
    // thread directly rather than leaving whatever was selected before.
    selectThread(focusThreadId).finally(() => onFocusThreadConsumed?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per focusThreadId change
  }, [focusThreadId]);

  const routeToDiscover = async (field) => {
    if (!selected || !isEvidenceGap(field, missingEvidenceIds)) return;
    setBusy(true);
    setError("");
    try {
      const handoff = await getSynthesisDiscoverHandoff(selected.id);
      const evidenceId = String(field.id || field.dataset_id || "");
      const match = (item) => String(item?.id || item?.evidence_id || item?.dataset_id || "") === evidenceId;
      const missingEvidence = (handoff?.missing_evidence || []).filter(match);
      const collectIntents = (handoff?.collect_intents || []).filter(match);
      if (!missingEvidence.length) throw new Error("This evidence gap is no longer part of the durable Discover handoff.");
      onDiscoverHandoff?.({
        field,
        handoff: { ...handoff, missing_evidence: missingEvidence, collect_intents: collectIntents },
        thread: selected,
      });
    } catch (cause) {
      setError(text(cause?.message, "The Discover handoff could not be prepared."));
    } finally {
      setBusy(false);
    }
  };

  const ask = (prompt, thread = selected, displayText = prompt) => {
    const context = thread
      ? `\n\nSynthesis thread: ${titleFor(thread)}\nObjective: ${text(thread.objective || thread.state?.objective)}\nDurable status: ${stageLabel(thread)}.`
      : "\n\nSynthesis workspace context.";
    onAskComposer?.({
      prompt: `${text(prompt)}${context}`,
      displayText: text(displayText, "Discuss this synthesis"),
    });
  };

  const startMethodReasoning = (thread = selected) => {
    if (!thread?.id) return;
    setReasoningThreadId(thread.id);
    setInterpretingStalled(false);
    interpretingThreadIdRef.current = thread.id;
    interpretingSinceRef.current = Date.now();
    ask(
      "Ground this research brief in the recorded Library evidence and create one reviewable Synthesis proposal. State its evidence roles, target grain, direct-measure limitation, and the one unresolved choice that matters most. Record the proposal for review; do not accept it, collect evidence, execute work, or alter data.",
      thread,
    );
  };

  const beginNew = () => {
    setSelectedId("");
    setReasoningThreadId("");
    setNewMode(true);
    setObjective("");
    setError("");
    onSelectThread?.(null);
    onBeginNew?.();
  };

  const createThread = async () => {
    const nextObjective = objective.trim();
    if (!nextObjective) return;
    setBusy(true);
    setError("");
    try {
      const created = await createSynthesisThread({
        objective: nextObjective,
        title: titleFromObjective(nextObjective),
      });
      replaceThread(created);
      setSelectedId(created.id);
      setNewMode(false);
      setObjective("");
      onSelectThread?.(created);
      setReasoningThreadId(created.id);
      ask(
        `Interpret this research objective. Separate supported evidence, proposed proxy choices, and unresolved limitations, then ask the one highest-value clarification question: ${nextObjective}`,
        created,
        nextObjective,
      );
    } catch (cause) {
      setError(text(cause?.message, "The Synthesis thread could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const startBlueprint = async (profile) => {
    if (!profile?.id) return;
    const title = text(profile.title, profile.id);
    const sources = Array.isArray(profile.sources)
      ? profile.sources.map((s) => s.label || s.id).filter(Boolean).join("; ")
      : "";
    const questions = Array.isArray(profile.research_questions) ? profile.research_questions.filter(Boolean) : [];
    const objectiveText = [
      `Blueprint: ${title}`,
      text(profile.description),
      sources ? `Registered inputs: ${sources}` : "",
      questions[0] ? `Lead question: ${questions[0]}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    setBusy(true);
    setError("");
    try {
      const created = await createSynthesisThread({
        objective: objectiveText,
        title,
        requiredGrain: Array.isArray(profile.join_keys) ? profile.join_keys.join(", ") : "",
      });
      replaceThread(created);
      setSelectedId(created.id);
      setNewMode(false);
      setObjective("");
      onSelectThread?.(created);
      setReasoningThreadId(created.id);
      ask(
        `Use registered blueprint ${profile.id} (${title}). Propose the smallest defensible construction from owned Library inputs. Do not invent missing sources.`,
        created,
        `Start from the registered blueprint: ${title}`,
      );
    } catch (cause) {
      setError(text(cause?.message, "Could not start this blueprint as a Synthesis thread."));
    } finally {
      setBusy(false);
    }
  };

  const decideProposal = async (decision) => {
    const proposal = selected?.state?.proposal;
    if (!selected || !proposal?.id || !proposal?.proposal_hash) return;
    setBusy(true);
    setError("");
    try {
      const next = await decideSynthesisProposal(selected.id, {
        decision,
        proposalId: proposal.id,
        proposalHash: proposal.proposal_hash,
      });
      replaceThread(next);
      onSelectThread?.(next);
    } catch (cause) {
      setError(text(cause?.message, "The proposal changed before this decision could be saved."));
      refreshThread().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const requestExecution = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      // Idempotency guard: a prior click's response can be lost even though
      // the server successfully created the job (slow network, tab backgrounded,
      // the researcher navigating away and back). Re-check durable state before
      // requesting again, so a retry after a dropped response cannot create a
      // second job against the same accepted specification.
      const current = await refreshThread(selected.id).catch(() => null);
      if (current) {
        replaceThread(current);
        onSelectThread?.(current);
        if (text(current?.state?.execution?.status)) return;
      }
      const result = await requestSynthesisExecution(selected.id);
      const next = result?.thread || (result?.state ? result : await refreshThread(selected.id));
      if (next) {
        replaceThread(next);
        onSelectThread?.(next);
      }
    } catch (cause) {
      setError(text(cause?.message, "The execution request could not be created."));
      refreshThread().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const mode = stateFor(selected);
  const focus = focusFor(selected?.state, promoted);
  const showExecution = Boolean(selected && (mode === "execution" || mode === "registered" || mode === "failed" || selected.state?.execution_spec));

  return (
    <PageShell className="rd-v2-synthesis-page">
      <SynthesisSidebarPortal>
        <ThreadList
          threads={threads}
          selectedId={selectedId}
          loading={loading}
          onSelect={selectThread}
          onNew={beginNew}
        />
      </SynthesisSidebarPortal>
      <div className="s04-shell" data-testid="synthesis-studio">
        <main className="s04-main">
          {error ? <DeskError raw={error} surface="your constructions" alert /> : null}
          {newMode ? (
            <NewThread
              objective={objective}
              setObjective={setObjective}
              busy={busy}
              profiles={profiles}
              onCreate={createThread}
              onStartBlueprint={startBlueprint}
            />
          ) : null}
          {!newMode && !loading && !selected ? (
            <EmptyWorkspace
              profiles={profiles}
              profilesLoading={profilesLoading}
              profilesError={profilesError}
              onStartBlueprint={startBlueprint}
              onNew={beginNew}
            />
          ) : null}
          {!newMode && selected ? (
            <>
              <ThreadHeader
                thread={selected}
                onEditIntent={() => ask("I want to revise this research intent. Show the change that would be recorded before applying it.")}
              />
              <ThreadPicker threads={threads} selectedId={selectedId} onSelect={selectThread} />
              {isPreAcceptance(selected) ? (
                <>
                  <RecommendedConstruction
                    thread={selected}
                    onCompare={() => ask("Compare the alternative constructions and say what each one costs.")}
                  />
                  <WhatHappensNext
                    thread={selected}
                    onCompare={() => ask("Compare the alternative constructions and say what each one costs.")}
                    onAccept={() => ask("Accept the recommended construction and draft the detailed method.")}
                    onStartReasoning={() => startMethodReasoning()}
                    reasoningPending={reasoningPending}
                  />
                </>
              ) : null}
              <ContextStrip items={focus.strip.filter((item) => !RECORD_ALWAYS.includes(item.id))}
                            onPromote={setPromoted} promoted={focus.promoted}
                            onClear={() => setPromoted("")} />
              {focus.subject === "scope" ? (
                <ScopePanel
                  block={selected.state?.scope_block}
                  onChoose={(option) => ask(`Scope this construction ${option.label}. Say what that removes from my question.`)}
                  onAsk={ask}
                />
              ) : null}
              {focus.subject === "units" ? (
                <UnitConflictPanel
                  conflict={selected.state?.unit_conflict}
                  onChoose={(outcome) => ask(`Take the "${outcome.label}" reading for these two columns, and record why.`)}
                  onAsk={ask}
                />
              ) : null}
              <MethodSurfacePanel
                dataset={selected.state?.spec?.input_dataset_id}
                profiles={selected.state?.column_profiles}
                inUse={selected.state?.columns_in_use}
                onOpenColumn={(column) => ask(`Inspect ${column.column} in this construction.`)}
                onOverride={(group) => ask(`I want to include the ${group.heading} columns anyway.`)}
              />
              {focus.subject === "join" ? (
                <JoinDecisionPanel
                  leftLabel={selected.state?.spec?.input_dataset_id}
                  rightLabel={softIdentifier(selected.state?.join_candidate_dataset_id, "A second dataset")}
                  rightTotal={selected.state?.join_candidate_rows}
                  coverage={selected.state?.join_candidates}
                  onChooseKey={(candidate) => ask(`Use ${candidate.leftKey} to ${candidate.rightKey} for this join.`)}
                  onChooseOutcome={(outcome) => ask(`Take the "${outcome.label}" option for this join, and record why.`)}
                  onChooseCollapse={(choice) => ask(`Resolve the repeated key with "${choice.label}".`)}
                />
              ) : null}
              {mode === "proposal" ? (
                <ProposalReview thread={selected} busy={busy} onDecide={decideProposal} onAsk={ask} />
              ) : null}
              {showExecution ? (
                <ExecutionRecord
                  thread={selected}
                  busy={busy}
                  onRequest={requestExecution}
                  onReview={onReviewExecution}
                  onAsk={ask}
                  onOpenDataset={onOpenDataset}
                />
              ) : null}
              {synthesisShowsEvidenceMap(selected) ? (
                <EvidenceMap
                  thread={selected}
                  onAsk={ask}
                  selectedField={selectedField}
                  onSelectField={setSelectedField}
                  onRouteToDiscover={routeToDiscover}
                  missingIds={missingEvidenceIds}
                />
              ) : null}
              <ExcursionRecordPanel
                excursions={selected.state?.excursions}
                onResume={(entry) => ask(`Pick up the search for ${entry.searched} again.`)}
                onAsk={ask}
              />
              <SettledDecisionsPanel
                decisions={selected.state?.settled_decisions}
                onContest={(decision) => ask(`Reopen this decision: ${decision.summary}.`)}
              />
              <ProvenancePanel
                provenance={selected.state?.provenance}
                onViewCode={() => ask("Show me the exported method as code.")}
                onDownload={() => ask("Give me the script for this method.")}
                onCite={() => ask("Give me a citation line for this output.")}
              />
              <ReusePanel
                source={selected.state?.reuse_from}
                changes={selected.state?.reuse_changes}
                onChange={(change) => ask(`For the revision, change ${change.label}.`)}
                onPreview={() => ask("Preview this revision before building it.")}
              />
              {/* The opening remains compact until a researcher actually starts a
                  reasoning turn. Then this is a transient, truthful progress
                  record—not a second, decorative restatement of the brief. */}
              {reasoningPending && !focus.blocking ? (
                <DraftCanvas thread={selected} onAsk={ask} stalled={interpretingStalled} onRetry={retryInterpreting} />
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </PageShell>
  );
}

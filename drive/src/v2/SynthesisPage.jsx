import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageShell } from "@/v2/ui";
import {
  applySynthesisEvidenceMap,
  createSynthesisThread,
  decideSynthesisProposal,
  getSynthesisDiscoverHandoff,
  getSynthesisMeasurements,
  getSynthesisThread,
  listSynthesisProfiles,
  listSynthesisThreads,
  proposeSynthesisEvidenceMap,
  requestSynthesisExecution,
} from "@/v2/api";
import { DeskError } from "@/v2/DeskError";
import { resolveSurfaceLifecycle } from "@/v2/surfaceLifecycle";
import {
  resolveSynthesisJourneyStage,
  synthesisJourney,
  synthesisJourneyStage,
} from "./synthesisLifecycle.js";
import { SynthesisJourneyNav } from "./SynthesisJourneyNav.jsx";
import { SynthesisSpecificationPage } from "./SynthesisSpecificationPage.jsx";
import {
  approveSynthesisExecutionJob,
  getSynthesisExecutionJob,
  persistSynthesisProposal,
} from "./synthesisJourneyApi.js";
import "./synthesisJourney.css";

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function titleFor(thread) {
  return text(thread?.title || thread?.state?.title || thread?.objective || thread?.state?.objective, "Untitled construction");
}

function objectiveFor(thread) {
  return text(thread?.objective || thread?.state?.objective);
}

function stageLabel(stage) {
  return stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : "Synthesis";
}

function readableStatus(status) {
  return text(status, "not started").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function evidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function evidenceId(node) {
  return text(node?.dataset_id || node?.id);
}

function mergedThread(thread, measurements) {
  if (!thread || !measurements) return thread;
  return {
    ...thread,
    state: {
      ...(thread.state || {}),
      column_profiles: measurements.column_profiles || [],
      unit_conflict: measurements.unit_conflict || null,
      join_candidates: measurements.join_candidates || [],
      input_dataset_ids: measurements.input_dataset_ids || evidenceNodes(thread).map(evidenceId).filter(Boolean),
      measured_inputs: measurements.measured_inputs,
      measurement_basis: measurements.measurement_basis,
      measurement_unmeasured: measurements.unmeasured || [],
    },
  };
}

function compactObjectiveTitle(objective) {
  const firstLine = text(objective).split(/\n+/)[0].replace(/^Blueprint:\s*/i, "").trim();
  return firstLine.length > 88 ? `${firstLine.slice(0, 85).trim()}…` : firstLine || "New construction";
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
  const active = threads.filter((thread) => !["registered", "query_ready"].includes(text(thread?.state?.execution?.status).toLowerCase()));
  const outputs = threads.filter((thread) => ["registered", "query_ready"].includes(text(thread?.state?.execution?.status).toLowerCase()));
  const render = (thread) => {
    const current = synthesisJourneyStage(thread);
    return (
      <button
        type="button"
        key={thread.id}
        className={`sj-thread-item ${thread.id === selectedId ? "active" : ""}`}
        onClick={() => onSelect(thread.id)}
        data-testid="synthesis-thread-item"
      >
        <strong>{titleFor(thread)}</strong>
        <small>{stageLabel(current)} · {text(thread.updated_at || thread.created_at, "durable thread")}</small>
      </button>
    );
  };
  return (
    <section className="sj-thread-list-panel" aria-label="Synthesis threads">
      <header>
        <div><h3>Constructions</h3><small>{loading ? "Loading" : `${active.length} active`}</small></div>
        <button type="button" className="sj-thread-new" onClick={onNew}>+ New construction</button>
      </header>
      <div className="sj-thread-list">
        {active.map(render)}
        {!loading && !active.length ? <p className="sj-thread-empty">No active constructions.</p> : null}
      </div>
      {outputs.length ? (
        <>
          <h3>Registered outputs</h3>
          <div className="sj-thread-list">{outputs.map(render)}</div>
        </>
      ) : null}
    </section>
  );
}

function StageIntro({ stage, current, children, chip = "" }) {
  return (
    <header className="sj-stage-header">
      <div>
        <small>{stage}</small>
        {children}
      </div>
      {chip ? <span className={`sj-state-chip ${current ? "ready" : ""}`}>{chip}</span> : null}
    </header>
  );
}

function ObjectivePage({
  objective,
  setObjective,
  grain,
  setGrain,
  busy,
  onCreate,
  profiles,
  profilesLoading,
  onStartProfile,
}) {
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-objective">
      <StageIntro stage="Stage 1 · Objective" chip="No state written yet">
        <h2>Start one durable research object.</h2>
        <p>State what you are trying to construct. Creating it records only the research object; it does not search, choose evidence, propose a method, or start work.</p>
      </StageIntro>
      <div className="sj-objective-form">
        <label className="sj-field">
          <span>Research objective</span>
          <textarea
            aria-label="Research objective"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Example: Build a monthly country panel linking wildfire exposure to employment and firm activity without using future information."
          />
        </label>
        <div className="sj-objective-grid">
          <label className="sj-field">
            <span>Required grain · optional</span>
            <input value={grain} onChange={(event) => setGrain(event.target.value)} placeholder="country × month" />
          </label>
          <div className="sj-inline-alert neutral">
            <div><strong>Authority boundary</strong><span>The desk records your objective now. Evidence and method decisions are separate pages.</span></div>
          </div>
        </div>
        <div className="sj-objective-submit">
          <button type="button" className="primary" disabled={busy || !objective.trim()} onClick={onCreate}>
            {busy ? "Creating…" : "Create research object"}
          </button>
        </div>
      </div>
      <section className="sj-method-starters" aria-label="Registered synthesis methods">
        <header><h3>Or start from a registered method</h3><small>{profilesLoading ? "Loading…" : `${profiles.length} available`}</small></header>
        <div className="sj-method-grid">
          {profiles.slice(0, 6).map((profile) => (
            <button type="button" className="sj-method-card" key={profile.id} disabled={busy} onClick={() => onStartProfile(profile)}>
              <strong>{text(profile.title, profile.id)}</strong>
              <small>{text(profile.description, "Registered method definition")}</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function EvidenceCard({ node, selected = false, selectable = false, onToggle }) {
  const id = evidenceId(node);
  const readiness = text(node?.readiness || node?.status, "readiness not stated");
  const facts = [text(node?.grain), text(node?.coverage), readiness].filter(Boolean).join(" · ");
  return (
    <label className={`sj-evidence-card ${selected ? "selected" : ""}`}>
      {selectable ? <input type="checkbox" checked={selected} onChange={() => onToggle?.(id)} /> : <span aria-hidden="true">✓</span>}
      <div>
        <strong>{text(node?.label || node?.title || node?.name, id)}</strong>
        <small>{id}</small>
        <em>{facts || "Held evidence candidate"}</em>
      </div>
      <em>{selectable ? "Candidate" : "Mapped"}</em>
    </label>
  );
}

function EvidencePage({
  thread,
  proposal,
  checked,
  onToggle,
  busy,
  searching,
  onFind,
  onApply,
  onDiscover,
  readOnly = false,
}) {
  const mapped = evidenceNodes(thread);
  const candidates = Array.isArray(proposal?.nodes) ? proposal.nodes : [];
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-evidence">
      <StageIntro stage="Stage 2 · Evidence" chip={`${mapped.length} mapped`}>
        <h2>Choose the evidence that is allowed to shape this construction.</h2>
        <p>Suggestions are held-only and read-only until you select them. Adding evidence changes the durable construction; simply finding a semantic match does not.</p>
      </StageIntro>

      <section className="sj-decision-block">
        <header><span>1</span><div><h3>Mapped evidence</h3><p>These Library objects are already part of the durable thread.</p></div></header>
        <div className="sj-evidence-list">
          {mapped.map((node) => <EvidenceCard key={evidenceId(node)} node={node} />)}
          {!mapped.length ? <p className="sj-empty-copy">No Library evidence is attached yet.</p> : null}
        </div>
      </section>

      {!readOnly ? (
        <section className="sj-decision-block">
          <header><span>2</span><div><h3>Held-evidence proposal</h3><p>The desk can search held Library assets for relevant candidates without writing anything.</p></div></header>
          {candidates.length ? (
            <div className="sj-evidence-list">
              {candidates.map((node) => (
                <EvidenceCard
                  key={evidenceId(node)}
                  node={node}
                  selectable
                  selected={checked.has(evidenceId(node))}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ) : (
            <div className="sj-inline-alert neutral">
              <div><strong>{proposal ? "No additional held match was proposed." : "No held-evidence search has run on this page."}</strong><span>{text(proposal?.reason, "Search the Library first; if coverage is still missing, route the explicit gap to Discover.")}</span></div>
              <button type="button" disabled={searching} onClick={onFind}>{searching ? "Searching…" : "Find held Library evidence"}</button>
            </div>
          )}
          {candidates.length ? (
            <div className="sj-evidence-actions">
              <button type="button" onClick={onFind} disabled={searching}>{searching ? "Refreshing…" : "Refresh candidates"}</button>
              <button type="button" className="primary" onClick={onApply} disabled={busy || !checked.size}>{busy ? "Adding…" : `Add ${checked.size || "selected"} evidence ${checked.size === 1 ? "item" : "items"}`}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!readOnly ? (
        <footer className="sj-stage-actions">
          <div><strong>{mapped.length ? "Evidence is attached." : "No evidence means no method yet."}</strong><span>{mapped.length ? "The durable thread now earns Specification. Use the journey above to continue." : "If the Library cannot cover the objective, carry the exact gap to Discover instead of inventing a source."}</span></div>
          <button type="button" onClick={onDiscover}>Search missing evidence in Discover</button>
        </footer>
      ) : null}
    </section>
  );
}

function SpecificationRecordPage({ thread }) {
  const spec = thread?.state?.execution_spec || thread?.state?.spec || null;
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-specification">
      <StageIntro stage="Stage 3 · Specification" chip={spec ? "Recorded" : "Not retained"}>
        <h2>Recorded construction specification.</h2>
        <p>This is a read-only view of what the durable thread still proves about the method.</p>
      </StageIntro>
      {spec ? <pre className="sj-code-block">{JSON.stringify(spec, null, 2)}</pre> : <div className="sj-inline-alert warn"><div><strong>No durable specification is available for this revision.</strong><span>The page will not reconstruct one from later output metadata.</span></div></div>}
    </section>
  );
}

function ProposalPage({ thread, busy, onDecision, readOnly = false }) {
  const proposal = thread?.state?.proposal || null;
  const acceptedHash = text(thread?.state?.accepted_spec_hash);
  const executionSpec = thread?.state?.execution_spec || null;
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-proposal">
      <StageIntro stage="Stage 4 · Proposal" chip={proposal ? "Review required" : acceptedHash ? "Accepted revision" : "No proposal"}>
        <h2>{proposal ? "Review the exact revision before it changes the construction." : "Proposal record"}</h2>
        <p>{proposal ? "Acceptance applies only this validated proposal hash and persists its execution specification. Rejection changes nothing else." : "Only durable accepted-revision facts are shown after the live proposal has been consumed."}</p>
      </StageIntro>
      {proposal ? (
        <>
          <div className="sj-proposal-facts">
            <div className="sj-proposal-fact"><strong>{text(proposal.title, proposal.id)}</strong><small>{text(proposal.summary, "No summary")}</small></div>
            <div className="sj-proposal-fact"><strong>Revision hash</strong><code>{text(proposal.proposal_hash, "Not validated")}</code></div>
            {proposal.reason ? <div className="sj-proposal-fact"><strong>Why this revision exists</strong><small>{proposal.reason}</small></div> : null}
          </div>
          <ol className="sj-operation-list">
            {(proposal.operations || []).map((operation, index) => (
              <li key={`${operation.op || "op"}-${index}`}><span>{index + 1}</span><div><strong>{text(operation.op, "state change").replace(/_/g, " ")}</strong><small>{text(operation.summary || operation.message, operation.patch ? JSON.stringify(operation.patch) : "Validated state operation")}</small></div></li>
            ))}
          </ol>
          {proposal.execution_spec ? <pre className="sj-code-block">{JSON.stringify(proposal.execution_spec, null, 2)}</pre> : null}
          {!readOnly ? (
            <div className="sj-proposal-actions">
              <button type="button" disabled={busy} onClick={() => onDecision("reject")}>Reject revision</button>
              <button type="button" className="primary" disabled={busy || !proposal.proposal_hash} onClick={() => onDecision("accept")}>{busy ? "Saving…" : "Accept exact revision"}</button>
            </div>
          ) : null}
        </>
      ) : acceptedHash ? (
        <>
          <div className="sj-proposal-facts">
            <div className="sj-proposal-fact"><strong>Accepted execution-spec hash</strong><code>{acceptedHash}</code></div>
          </div>
          {executionSpec ? <pre className="sj-code-block">{JSON.stringify(executionSpec, null, 2)}</pre> : null}
          <div className="sj-inline-alert warn"><div><strong>Full accepted proposal snapshot is not retained in the current thread contract.</strong><span>This page intentionally does not recreate the deleted proposal from the accepted spec. The backend audit record is the next durability fix.</span></div></div>
        </>
      ) : <div className="sj-inline-alert neutral"><div><strong>No proposal has been recorded.</strong><span>A proposal page is earned only after the server validates and persists one.</span></div></div>}
    </section>
  );
}

function ReadinessPage({ thread, busy, onSubmit, readOnly = false }) {
  const spec = thread?.state?.execution_spec || null;
  const hash = text(thread?.state?.accepted_spec_hash || thread?.state?.execution?.spec_hash);
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-readiness">
      <StageIntro stage="Stage 5 · Readiness" chip={spec ? "Accepted spec" : "Not ready"}>
        <h2>Verify exactly what would be submitted for approval.</h2>
        <p>Method acceptance is not permission to run it. This page is the boundary between a recorded specification and an execution request.</p>
      </StageIntro>
      {spec ? <pre className="sj-code-block">{JSON.stringify(spec, null, 2)}</pre> : null}
      <div className="sj-proposal-facts">
        <div className="sj-proposal-fact"><strong>Accepted spec hash</strong><code>{hash || "Not recorded"}</code></div>
        <div className="sj-proposal-fact"><strong>Execution authority</strong><small>No worker may run until a researcher approves the submitted job.</small></div>
      </div>
      {!readOnly ? (
        <footer className="sj-stage-actions">
          <div><strong>Next: researcher approval</strong><span>Submitting creates a pending-approval job. It does not approve or execute it.</span></div>
          <button type="button" className="primary" disabled={busy || !spec} onClick={onSubmit}>{busy ? "Submitting…" : "Submit execution for approval"}</button>
        </footer>
      ) : null}
    </section>
  );
}

function ApprovalPage({ thread, job, busy, onApprove, onRefresh, readOnly = false }) {
  const execution = thread?.state?.execution || {};
  const jobId = text(execution.job_id || job?.id);
  const jobStatus = text(job?.status || execution.status, "pending_approval");
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-approval">
      <StageIntro stage="Stage 6 · Approval" chip={readableStatus(jobStatus)}>
        <h2>Authorize one exact execution request.</h2>
        <p>This is a human authority boundary. The assistant may explain the request but cannot approve Synthesis execution.</p>
      </StageIntro>
      <div className="sj-proposal-facts">
        <div className="sj-proposal-fact"><strong>Job</strong><code>{jobId || "No job recorded"}</code></div>
        <div className="sj-proposal-fact"><strong>Job status</strong><small>{readableStatus(jobStatus)}</small></div>
        <div className="sj-proposal-fact"><strong>Output</strong><code>{text(execution.output_dataset_id || thread?.state?.execution_spec?.output_dataset_id, "Not stated")}</code></div>
        <div className="sj-proposal-fact"><strong>Specification hash</strong><code>{text(execution.spec_hash || thread?.state?.accepted_spec_hash, "Not stated")}</code></div>
      </div>
      {!readOnly ? (
        <footer className="sj-stage-actions">
          <div><strong>{jobStatus === "pending_approval" ? "Nothing runs until you approve." : "Approval has been recorded; waiting for durable execution state."}</strong><span>The page advances only when the thread itself records a post-approval execution state.</span></div>
          <div className="sj-proposal-actions">
            <button type="button" onClick={onRefresh}>Refresh state</button>
            {jobStatus === "pending_approval" ? <button type="button" className="primary" disabled={busy || !jobId} onClick={onApprove}>{busy ? "Approving…" : "Approve this execution"}</button> : null}
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function BuildPage({ thread, job, onRefresh, onReviewExecution, readOnly = false }) {
  const execution = thread?.state?.execution || {};
  const status = text(execution.status, "unknown").toLowerCase().replace(/-/g, "_");
  const failed = status === "failed";
  const completed = status === "completed";
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-build">
      <StageIntro stage="Stage 7 · Build" chip={readableStatus(status)}>
        <h2>{failed ? "Execution stopped before a registered result existed." : completed ? "Worker completed; registration proof is still required." : "Follow the execution without inventing progress."}</h2>
        <p>Queued, running, worker-completed, archive verification, registration, and query readiness are different facts. This page keeps them separate.</p>
      </StageIntro>
      <div className="sj-result-grid">
        <div className="sj-result-fact"><strong>Execution status</strong><small>{readableStatus(status)}</small></div>
        <div className="sj-result-fact"><strong>Job</strong><code>{text(execution.job_id || job?.id, "Not recorded")}</code></div>
        <div className="sj-result-fact"><strong>Output identity</strong><code>{text(execution.output_dataset_id || thread?.state?.execution_spec?.output_dataset_id, "Not recorded")}</code></div>
        <div className="sj-result-fact"><strong>Archive / registry</strong><small>{completed ? "Awaiting verification" : ["registering", "archiving"].includes(status) ? "Verification in progress" : "Not yet established"}</small></div>
      </div>
      {failed ? <div className="sj-inline-alert error"><div><strong>Execution failed.</strong><span>{text(execution.error || execution.summary || execution.reason, "The durable record does not include a failure summary.")}</span></div></div> : null}
      {completed ? <div className="sj-inline-alert warn"><div><strong>Do not call this Result yet.</strong><span>A completed worker is not proof that the output was archived, registered, or query-ready.</span></div></div> : null}
      {!readOnly ? (
        <div className="sj-result-actions">
          {onReviewExecution ? <button type="button" onClick={() => onReviewExecution(thread)}>Open execution record</button> : null}
          <button type="button" onClick={onRefresh}>Refresh durable state</button>
        </div>
      ) : null}
    </section>
  );
}

function ResultPage({ thread, onOpenDataset }) {
  const execution = thread?.state?.execution || {};
  const status = text(execution.status).toLowerCase().replace(/-/g, "_");
  const output = text(execution.output_dataset_id || thread?.state?.execution_spec?.output_dataset_id);
  const queryReady = status === "query_ready";
  return (
    <section className="sj-stage-page" data-testid="synthesis-stage-result">
      <StageIntro stage="Stage 8 · Result" chip={queryReady ? "Query ready" : "Registered"}>
        <h2>The output exists as a registered research asset.</h2>
        <p>Result is earned only from explicit registration state. Query readiness remains separate unless the backend records it.</p>
      </StageIntro>
      <div className="sj-result-grid">
        <div className="sj-result-fact"><strong>Output dataset</strong><code>{output || "Not recorded"}</code></div>
        <div className="sj-result-fact"><strong>Registration state</strong><small>{queryReady ? "Registered and query ready" : "Registered · query readiness not established"}</small></div>
        {execution.rows != null ? <div className="sj-result-fact"><strong>Rows</strong><small>{Number(execution.rows).toLocaleString()}</small></div> : null}
        {execution.manifest_id ? <div className="sj-result-fact"><strong>Manifest</strong><code>{execution.manifest_id}</code></div> : null}
        {execution.drive_verified != null ? <div className="sj-result-fact"><strong>Archive verification</strong><small>{execution.drive_verified ? "Verified" : "Not verified"}</small></div> : null}
      </div>
      <div className="sj-result-actions">
        <button type="button" className="primary" disabled={!output} onClick={() => output && onOpenDataset?.(output)}>Open result in Library</button>
      </div>
    </section>
  );
}

export function SynthesisPage({
  onAskComposer,
  assistantRuntime = null,
  assistantAllowed = false,
  onGoTab,
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
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [objective, setObjective] = useState("");
  const [grain, setGrain] = useState("");
  const [evidenceProposal, setEvidenceProposal] = useState(null);
  const [checkedEvidence, setCheckedEvidence] = useState(() => new Set());
  const [searchingEvidence, setSearchingEvidence] = useState(false);
  const [measurements, setMeasurements] = useState(null);
  const [measurementPhase, setMeasurementPhase] = useState("idle");
  const [job, setJob] = useState(null);
  const [inspectedStage, setInspectedStage] = useState("objective");
  const previousCurrentRef = useRef("objective");

  const replaceThread = useCallback((next) => {
    if (!next?.id) return;
    setThreads((current) => {
      const exists = current.some((thread) => thread.id === next.id);
      return exists ? current.map((thread) => thread.id === next.id ? next : thread) : [next, ...current];
    });
  }, []);

  const refreshThreads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listSynthesisThreads();
      const next = Array.isArray(result?.threads) ? result.threads : [];
      setThreads(next);
      setSelectedId((current) => current && next.some((thread) => thread.id === current) ? current : next[0]?.id || "");
    } catch (cause) {
      setError(text(cause?.message, "Synthesis threads could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshThreads(); }, [refreshThreads]);

  useEffect(() => {
    let cancelled = false;
    setProfilesLoading(true);
    listSynthesisProfiles()
      .then((result) => { if (!cancelled) setProfiles(Array.isArray(result?.profiles) ? result.profiles : []); })
      .catch(() => { if (!cancelled) setProfiles([]); })
      .finally(() => { if (!cancelled) setProfilesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => threads.find((thread) => thread.id === selectedId) || null, [threads, selectedId]);
  const currentStage = synthesisJourneyStage(selected);
  const journey = synthesisJourney(selected);
  const displayedThread = useMemo(() => mergedThread(selected, measurements), [selected, measurements]);
  const reasoningAvailable = Boolean(assistantAllowed && assistantRuntime?.ready === true && onAskComposer);

  const refreshThread = useCallback(async (threadId = selectedId) => {
    if (!threadId) return null;
    const next = await getSynthesisThread(threadId);
    replaceThread(next);
    return next;
  }, [replaceThread, selectedId]);

  useEffect(() => {
    if (!selected) {
      setInspectedStage("objective");
      previousCurrentRef.current = "objective";
      onSelectThread?.(null);
      return;
    }
    const previousCurrent = previousCurrentRef.current;
    setInspectedStage((current) => {
      if (!current || current === previousCurrent) return currentStage;
      return resolveSynthesisJourneyStage(selected, current);
    });
    previousCurrentRef.current = currentStage;
  }, [selected?.id, currentStage, onSelectThread]);

  useEffect(() => {
    if (!selected) return;
    onSelectThread?.(displayedThread || selected);
  }, [displayedThread, onSelectThread, selected]);

  useEffect(() => {
    setEvidenceProposal(null);
    setCheckedEvidence(new Set());
    setMeasurements(null);
    setMeasurementPhase("idle");
    setJob(null);
  }, [selected?.id]);

  const mappedIds = useMemo(() => evidenceNodes(selected).map(evidenceId).filter(Boolean), [selected]);
  const mappedKey = mappedIds.join("|");

  const loadMeasurements = useCallback(async () => {
    if (!selected?.id || !mappedIds.length) return null;
    setMeasurementPhase("loading");
    try {
      const result = await getSynthesisMeasurements(selected.id);
      setMeasurements(result);
      setMeasurementPhase("ready");
      return result;
    } catch {
      setMeasurements(null);
      setMeasurementPhase("error");
      return null;
    }
  }, [selected?.id, mappedKey]);

  useEffect(() => {
    if (!selected?.id || !mappedIds.length) return;
    const currentIndex = journey.currentIndex;
    const specificationIndex = journey.stages.find((stage) => stage.id === "specification")?.index ?? 2;
    if (currentIndex < specificationIndex) return;
    loadMeasurements();
  }, [selected?.id, selected?.updated_at, mappedKey, currentStage]);

  const executionJobId = text(selected?.state?.execution?.job_id);
  const loadJob = useCallback(async () => {
    if (!executionJobId) {
      setJob(null);
      return null;
    }
    try {
      const result = await getSynthesisExecutionJob(executionJobId);
      const next = result?.job || result;
      setJob(next || null);
      return next;
    } catch {
      return null;
    }
  }, [executionJobId]);

  useEffect(() => { loadJob(); }, [loadJob]);

  useEffect(() => {
    if (!selected?.id) return undefined;
    const status = text(selected?.state?.execution?.status).toLowerCase().replace(/-/g, "_");
    if (!["pending_approval", "queued", "running", "registering", "archiving", "completed"].includes(status)) return undefined;
    const timer = window.setInterval(() => {
      refreshThread(selected.id).catch(() => {});
      loadJob();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [selected?.id, selected?.state?.execution?.status, refreshThread, loadJob]);

  useEffect(() => {
    if (!refreshVersion || !selectedId) return;
    refreshThread(selectedId).catch(() => {});
  }, [refreshVersion, refreshThread, selectedId]);

  useEffect(() => {
    if (!focusThreadId) return;
    setSelectedId(focusThreadId);
    refreshThread(focusThreadId).catch(() => {}).finally(() => onFocusThreadConsumed?.());
  }, [focusThreadId]);

  const ask = (prompt, stage = inspectedStage) => {
    if (!reasoningAvailable) return;
    const context = selected
      ? `\n\nSynthesis thread: ${titleFor(selected)}\nObjective: ${objectiveFor(selected)}\nWorkflow page: ${stageLabel(stage)}\nDurable current page: ${stageLabel(currentStage)}.`
      : "\n\nSynthesis workspace; no durable construction selected.";
    onAskComposer?.({
      prompt: `${text(prompt)}${context}`,
      displayText: `Synthesis · ${stageLabel(stage)}`,
    });
  };

  const beginNew = () => {
    setSelectedId("");
    setObjective("");
    setGrain("");
    setError("");
    setInspectedStage("objective");
    onSelectThread?.(null);
    onBeginNew?.();
  };

  const createThread = async (override = {}) => {
    const nextObjective = text(override.objective || objective);
    if (!nextObjective) return;
    setBusy(true);
    setError("");
    try {
      const created = await createSynthesisThread({
        objective: nextObjective,
        title: text(override.title, compactObjectiveTitle(nextObjective)),
        requiredGrain: text(override.requiredGrain || grain),
      });
      replaceThread(created);
      setSelectedId(created.id);
      setObjective("");
      setGrain("");
      setInspectedStage("evidence");
      onSelectThread?.(created);
    } catch (cause) {
      setError(text(cause?.message, "The durable research object could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const startProfile = async (profile) => {
    const sources = Array.isArray(profile?.sources) ? profile.sources.map((source) => source.label || source.id).filter(Boolean) : [];
    const questions = Array.isArray(profile?.research_questions) ? profile.research_questions.filter(Boolean) : [];
    const profileObjective = [
      text(profile?.description),
      questions[0] ? `Lead question: ${questions[0]}` : "",
      sources.length ? `Registered inputs: ${sources.join("; ")}` : "",
    ].filter(Boolean).join("\n");
    await createThread({
      objective: profileObjective || `Registered method: ${text(profile?.title, profile?.id)}`,
      title: text(profile?.title, profile?.id),
      requiredGrain: Array.isArray(profile?.join_keys) ? profile.join_keys.join(", ") : "",
    });
  };

  const selectThread = async (threadId) => {
    setSelectedId(threadId);
    setError("");
    try { await refreshThread(threadId); } catch (cause) { setError(text(cause?.message, "This construction could not be refreshed.")); }
  };

  const findEvidence = async () => {
    if (!selected?.id) return;
    setSearchingEvidence(true);
    setError("");
    try {
      const proposal = await proposeSynthesisEvidenceMap(selected.id);
      setEvidenceProposal(proposal);
      setCheckedEvidence(new Set());
    } catch (cause) {
      setError(text(cause?.message, "Held Library evidence could not be searched for this construction."));
    } finally {
      setSearchingEvidence(false);
    }
  };

  const toggleEvidence = (id) => {
    setCheckedEvidence((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyEvidence = async () => {
    if (!selected?.id || !checkedEvidence.size) return;
    setBusy(true);
    setError("");
    try {
      const result = await applySynthesisEvidenceMap(selected.id, { datasetIds: [...checkedEvidence] });
      const next = result?.thread || result;
      if (next?.id) replaceThread(next); else await refreshThread(selected.id);
      setEvidenceProposal(null);
      setCheckedEvidence(new Set());
    } catch (cause) {
      setError(text(cause?.message, "The reviewed Library evidence could not be attached."));
      refreshThread(selected.id).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const routeToDiscover = async () => {
    if (!selected?.id) {
      onGoTab?.("discover");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const handoff = await getSynthesisDiscoverHandoff(selected.id);
      onDiscoverHandoff?.({ thread: selected, handoff });
      if (!onDiscoverHandoff) onGoTab?.("discover");
    } catch (cause) {
      setError(text(cause?.message, "The missing-evidence handoff could not be prepared."));
    } finally {
      setBusy(false);
    }
  };

  const saveProposal = async (proposal) => {
    if (!selected?.id) return;
    setBusy(true);
    setError("");
    try {
      const next = await persistSynthesisProposal(selected.id, proposal);
      replaceThread(next);
      setInspectedStage("proposal");
      onSelectThread?.(next);
      return next;
    } catch (cause) {
      setError(text(cause?.message, "The server rejected this proposal before review."));
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const decideProposal = async (decision) => {
    const proposal = selected?.state?.proposal;
    if (!selected?.id || !proposal?.id || !proposal?.proposal_hash) return;
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
      refreshThread(selected.id).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const submitExecution = async () => {
    if (!selected?.id) return;
    setBusy(true);
    setError("");
    try {
      const latest = await refreshThread(selected.id).catch(() => selected);
      if (text(latest?.state?.execution?.status) && text(latest?.state?.execution?.status) !== "spec_accepted") return;
      const result = await requestSynthesisExecution(selected.id);
      const next = result?.thread || result;
      if (next?.id) replaceThread(next); else await refreshThread(selected.id);
      await loadJob();
    } catch (cause) {
      setError(text(cause?.message, "The execution request could not be submitted for approval."));
      refreshThread(selected.id).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const approveExecution = async () => {
    const jobId = text(selected?.state?.execution?.job_id || job?.id);
    if (!jobId) return;
    setBusy(true);
    setError("");
    try {
      await approveSynthesisExecutionJob(jobId);
      await Promise.all([refreshThread(selected.id), loadJob()]);
    } catch (cause) {
      setError(text(cause?.message, "The execution approval could not be recorded."));
    } finally {
      setBusy(false);
    }
  };

  const inspectStage = (stage) => {
    setInspectedStage(resolveSynthesisJourneyStage(selected, stage));
  };

  const renderStage = () => {
    if (!selected) {
      return (
        <ObjectivePage
          objective={objective}
          setObjective={setObjective}
          grain={grain}
          setGrain={setGrain}
          busy={busy}
          onCreate={() => createThread()}
          profiles={profiles}
          profilesLoading={profilesLoading}
          onStartProfile={startProfile}
        />
      );
    }
    const readOnly = inspectedStage !== currentStage;
    switch (inspectedStage) {
      case "objective":
        return (
          <section className="sj-stage-page" data-testid="synthesis-stage-objective">
            <StageIntro stage="Stage 1 · Objective" chip="Recorded">
              <h2>{titleFor(selected)}</h2>
              <p>{objectiveFor(selected)}</p>
            </StageIntro>
            <div className="sj-proposal-facts">
              <div className="sj-proposal-fact"><strong>Durable thread</strong><code>{selected.id}</code></div>
              <div className="sj-proposal-fact"><strong>Required grain</strong><small>{text(selected?.state?.required_grain || selected?.required_grain, "Not stated")}</small></div>
            </div>
          </section>
        );
      case "evidence":
        return <EvidencePage thread={selected} proposal={evidenceProposal} checked={checkedEvidence} onToggle={toggleEvidence} busy={busy} searching={searchingEvidence} onFind={findEvidence} onApply={applyEvidence} onDiscover={routeToDiscover} readOnly={readOnly} />;
      case "specification":
        return readOnly
          ? <SpecificationRecordPage thread={selected} />
          : <SynthesisSpecificationPage thread={selected} measurements={measurements} measurementPhase={measurementPhase} onRetryMeasurements={loadMeasurements} onPersistProposal={saveProposal} busy={busy} onAsk={reasoningAvailable ? ask : null} />;
      case "proposal":
        return <ProposalPage thread={selected} busy={busy} onDecision={decideProposal} readOnly={readOnly} />;
      case "readiness":
        return <ReadinessPage thread={selected} busy={busy} onSubmit={submitExecution} readOnly={readOnly} />;
      case "approval":
        return <ApprovalPage thread={selected} job={job} busy={busy} onApprove={approveExecution} onRefresh={() => Promise.all([refreshThread(selected.id), loadJob()])} readOnly={readOnly} />;
      case "build":
        return <BuildPage thread={selected} job={job} onRefresh={() => Promise.all([refreshThread(selected.id), loadJob()])} onReviewExecution={onReviewExecution} readOnly={readOnly} />;
      case "result":
        return <ResultPage thread={selected} onOpenDataset={onOpenDataset} />;
      default:
        return null;
    }
  };

  const surfaceState = resolveSurfaceLifecycle({ loading, error, count: threads.length });

  return (
    <PageShell className="rd-v2-synthesis-page" surfaceState={surfaceState}>
      <SynthesisSidebarPortal>
        <ThreadList threads={threads} selectedId={selectedId} loading={loading} onSelect={selectThread} onNew={beginNew} />
      </SynthesisSidebarPortal>
      <div className="sj-shell" data-testid="synthesis-studio">
        {error ? <DeskError raw={error} surface="this synthesis workflow" alert /> : null}
        {selected ? (
          <>
            <header className="sj-object-header">
              <div>
                <small>Synthesis · durable research object</small>
                <h1>{titleFor(selected)}</h1>
                <div className="sj-object-meta">
                  <span>{selected.id}</span>
                  <span>Current page · {stageLabel(currentStage)}</span>
                  <span>{mappedIds.length} mapped evidence {mappedIds.length === 1 ? "input" : "inputs"}</span>
                </div>
              </div>
              <div className="sj-object-actions">
                {reasoningAvailable ? <button type="button" onClick={() => ask("Help me reason about the current Synthesis page. Separate measured facts, researcher choices, and unresolved questions. Do not advance the workflow unless I explicitly ask.")}>Ask about this page</button> : null}
                <button type="button" onClick={() => refreshThread(selected.id)}>Refresh</button>
                <button type="button" onClick={beginNew}>New construction</button>
              </div>
            </header>
            <SynthesisJourneyNav thread={selected} inspectedStage={inspectedStage} onInspect={inspectStage} />
            {inspectedStage !== currentStage ? (
              <div className="sj-inspection-note">
                <span>You are inspecting the recorded <strong>{stageLabel(inspectedStage)}</strong> page. Current work is <strong>{stageLabel(currentStage)}</strong>.</span>
                <button type="button" onClick={() => setInspectedStage(currentStage)}>Return to current work →</button>
              </div>
            ) : null}
          </>
        ) : null}
        {!loading ? renderStage() : null}
      </div>
    </PageShell>
  );
}

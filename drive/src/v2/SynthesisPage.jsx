import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/v2/ui";
import {
  createSynthesisThread,
  decideSynthesisProposal,
  getSynthesisThread,
  listSynthesisThreads,
  requestSynthesisExecution,
} from "@/v2/api";
import { facultyFacingRecords } from "@/v2/productVisibility";
import {
  constructionComposerContext,
  normalizeResearchConstruction,
} from "@/v2/ResearchConstructionViewModel";
import { facultyStateLabel, RESEARCH_ACTIONS } from "@/v2/researchValue";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function preferredThread(threads, datasets) {
  const substantive = threads.find((thread) => {
    const view = normalizeResearchConstruction(thread, datasets);
    const generic = /^(?:new|untitled) (?:synthesis|research construction)$/i.test(view?.title || "");
    return view && !generic && (view.question.length >= 24 || view.evidenceHeld.length || view.evidenceMissing.length);
  });
  return substantive || threads[0] || null;
}

function threadStatus(view) {
  if (!view) return "State not established";
  if (view.mode === "query_ready") return "Ready for analysis";
  if (view.mode === "registered") return "Indexed in research estate";
  if (view.mode === "failed") return "Needs recovery";
  if (view.mode === "proposal") return "Waiting for your decision";
  if (view.mode === "execution") {
    return facultyStateLabel(view.raw?.state?.execution?.status, "Execution state not established");
  }
  if (view.evidenceMissing.length) return `${view.evidenceMissing.length} evidence gap${view.evidenceMissing.length === 1 ? "" : "s"}`;
  if (view.method.state !== "accepted") return "Method decision required";
  return "Construction active";
}

function ThreadList({
  threads,
  datasets,
  selectedId,
  loading,
  technicalCount = 0,
  showTechnical = false,
  onToggleTechnical,
  onSelect,
  onNew,
}) {
  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <aside className="s04-threads rd-rc3-synthesis-threads rd-loop7-thread-list" aria-label="Research constructions">
      <header>
        <div><span>Research constructions</span><small>{loading ? "Loading" : `${threads.length} visible`}</small></div>
        <button type="button" className="s04-thread-new" aria-label="+ New" onClick={onNew}>New construction</button>
      </header>
      <div className="rd-loop7-thread-items">
        {threads.map((thread) => {
          const view = normalizeResearchConstruction(thread, datasets);
          return (
            <button
              type="button"
              key={thread.id}
              ref={thread.id === selectedId ? selectedRef : null}
              className={thread.id === selectedId ? "active" : ""}
              onClick={() => onSelect(thread.id)}
              data-testid="synthesis-thread-item"
            >
              <b>{["registered", "query_ready"].includes(view.mode) ? "✓" : view.mode === "failed" ? "!" : "C"}</b>
              <span><strong>{view.title}</strong><small>{threadStatus(view)}</small></span>
            </button>
          );
        })}
      </div>
      {!loading && !threads.length ? <p className="s04-thread-empty">No faculty-facing research constructions yet.</p> : null}
      <footer>
        {technicalCount ? (
          <button type="button" className="rd-v2-btn sm" onClick={onToggleTechnical}>
            {showTechnical ? "Hide technical constructions" : `Show technical constructions (${technicalCount})`}
          </button>
        ) : null}
      </footer>
    </aside>
  );
}

function EvidenceRow({ item, kind, onSelect }) {
  const gap = kind === "gap";
  return (
    <button
      type="button"
      className={`rd-loop7-evidence-row ${gap ? "gap" : "held"}`}
      onClick={() => onSelect(gap ? "evidence_missing" : "evidence_held", item)}
      data-evidence-kind={kind}
    >
      <span className="rd-loop7-evidence-mark" aria-hidden>{gap ? "!" : "✓"}</span>
      <span className="rd-loop7-evidence-copy">
        <strong>{item.label}</strong>
        <small>{item.grain} · {item.coverage}</small>
      </span>
      <span className="rd-loop7-evidence-state">{gap ? "Required" : item.stateLabel}</span>
    </button>
  );
}

function ResearchField({ label, value, field, selectedField, onSelect, editorial = false, children }) {
  return (
    <section
      className={`rd-loop7-field${selectedField === field ? " selected" : ""}${editorial ? " editorial" : ""}`}
      data-field={field}
    >
      <button type="button" className="rd-loop7-field-focus" onClick={() => onSelect(field)} aria-label={`Discuss ${label} in Composer`}>
        <span>{label}</span>
      </button>
      {children || <p>{value}</p>}
    </section>
  );
}

function ConstructionCanvas({ view, selectedField, onSelectField, onAsk, onGoTab, onOpenDataset }) {
  const hasHeld = view.evidenceHeld.length > 0;
  const hasMissing = view.evidenceMissing.length > 0;
  const testId = view.mode === "draft" ? "synthesis-draft-state" : "synthesis-evidence-state";

  const investigateGap = () => {
    const gap = view.evidenceMissing[0];
    onAsk(
      `Resolve the active evidence gap. Compare held evidence first, then identify acquisition routes with coverage, access, limitations, and resulting asset contract. Gap: ${gap?.label || "No exact gap selected"}.`,
      "evidence_missing",
    );
    onGoTab?.("browse");
  };

  return (
    <section className="rd-loop7-construction" data-testid={testId} aria-label="Research construction">
      <header className="rd-loop7-construction-header">
        <div>
          <small>Research construction</small>
          <h1>{view.title}</h1>
        </div>
        <span className={`rd-loop7-construction-state ${view.mode}`}>{threadStatus(view)}</span>
      </header>

      <div className="rd-loop7-study-frame" aria-label="Study frame">
        <span><b>Unit of analysis</b>{view.unitOfAnalysis}</span>
        <span><b>Population</b>{view.population}</span>
        <span><b>Period</b>{view.period}</span>
      </div>

      <ResearchField label="Question" value={view.question} field="question" selectedField={selectedField} onSelect={onSelectField} editorial />

      <section className="rd-loop7-evidence" aria-label="Evidence state">
        <header>
          <div><span>Evidence state</span><strong>{view.evidenceHeld.length} held · {view.evidenceMissing.length} missing</strong></div>
        </header>
        <div className="rd-loop7-evidence-columns">
          <section aria-label="Available evidence">
            <h2>Available evidence</h2>
            {hasHeld ? view.evidenceHeld.map((item) => (
              <EvidenceRow key={item.id || item.label} item={item} kind="held" onSelect={onSelectField} />
            )) : <p className="rd-loop7-empty-state">No evidence asset is mapped to this construction.</p>}
          </section>
          <section aria-label="Missing evidence">
            <h2>Missing evidence</h2>
            {hasMissing ? view.evidenceMissing.map((item) => (
              <EvidenceRow key={item.id || item.label} item={item} kind="gap" onSelect={onSelectField} />
            )) : <p className="rd-loop7-empty-state">No explicit evidence gap is recorded. Conceptual completeness is not implied.</p>}
          </section>
        </div>
      </section>

      <div className="rd-loop7-contract-grid">
        <ResearchField label="Method" field="method" selectedField={selectedField} onSelect={onSelectField}>
          <div className={`rd-loop7-method-state ${view.method.state}`}>
            <strong>{view.method.label}</strong>
            <p>{view.method.acceptedDefinition}</p>
            {view.method.proposedDefinition ? <small>Proposed: {view.method.proposedDefinition}</small> : null}
          </div>
        </ResearchField>
        <ResearchField label="Output contract" field="output_contract" selectedField={selectedField} onSelect={onSelectField}>
          <dl className="rd-loop7-output-contract">
            <div><dt>Asset</dt><dd>{view.outputContract.datasetId || view.outputContract.label}</dd></div>
            <div><dt>Grain</dt><dd>{view.outputContract.grain}</dd></div>
            <div><dt>State</dt><dd>{view.outputContract.statusLabel}</dd></div>
          </dl>
        </ResearchField>
      </div>

      <section className="rd-loop7-next-decision" data-decision-type={view.nextDecision.type}>
        <div>
          <small>Next research decision</small>
          <h2>{view.nextDecision.title}</h2>
          <p>{view.nextDecision.detail}</p>
        </div>
        <div className="rd-loop7-next-actions">
          {hasMissing ? (
            <button type="button" className="rd-v2-btn" onClick={investigateGap}>{RESEARCH_ACTIONS.investigateGap}</button>
          ) : null}
          {["registered", "query_ready"].includes(view.mode) && view.outputContract.datasetId ? (
            <button
              type="button"
              className="rd-v2-btn"
              aria-label="Open in Library"
              onClick={() => onOpenDataset?.({ dataset_id: view.outputContract.datasetId, name: view.outputContract.datasetId, analysis_readiness: view.mode === "query_ready" ? "instant" : "registered" })}
            >
              {RESEARCH_ACTIONS.inspectEvidence}
            </button>
          ) : null}
          <button
            type="button"
            className="rd-v2-btn primary"
            aria-label="Develop in Ask"
            onClick={() => onAsk("Work on the selected research field and return an explicit proposal that names affected fields and preserves current accepted state.", selectedField)}
          >
            {RESEARCH_ACTIONS.askConstruction}
          </button>
        </div>
      </section>
    </section>
  );
}

function proposalAffectedFields(proposal) {
  const fields = (Array.isArray(proposal?.operations) ? proposal.operations : [])
    .map((operation) => text(operation.field || operation.path || operation.op || operation.type))
    .filter(Boolean)
    .map((value) => value.replace(/^state\.?/, "").replace(/[_.-]+/g, " "));
  return [...new Set(fields)];
}

function ProposalReview({ view, busy, onDecide, onAsk }) {
  const proposal = view.raw?.state?.proposal || {};
  const affected = proposalAffectedFields(proposal);
  const canDecide = Boolean(proposal.id && proposal.proposal_hash);
  return (
    <section className="rd-loop7-proposal" data-testid="synthesis-proposal-state">
      <header>
        <div><small>Proposed research decision</small><h2>{text(proposal.title, "Untitled proposed change")}</h2></div>
        <span>Exact revision review</span>
      </header>
      <p className="rd-loop7-proposal-definition">{text(proposal.summary, "The proposal did not provide a research definition.")}</p>
      <div className="rd-loop7-proposal-fields">
        <span>Affected fields</span>
        {affected.length ? <ul>{affected.map((field) => <li key={field}>{field}</li>)}</ul> : <p>Structured affected fields were not reported.</p>}
      </div>
      {!canDecide ? <p className="s04-fixture">This proposal has no revision hash, so it cannot be accepted from the desk.</p> : null}
      <footer>
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Challenge this exact proposal and identify every methodological, evidence, and output consequence.", "method")}>Review proposal rationale</button>
        <button type="button" className="rd-v2-btn" aria-label="Reject" disabled={busy || !canDecide} onClick={() => onDecide("reject")}>Reject proposed change</button>
        <button type="button" className="rd-v2-btn primary" aria-label="Accept proposal" disabled={busy || !canDecide} onClick={() => onDecide("accept")}>Accept proposed change</button>
      </footer>
    </section>
  );
}

function ExecutionRecord({ view, busy, onRequest, onAsk, onOpenDataset }) {
  const execution = view.raw?.state?.execution || {};
  const spec = view.raw?.state?.execution_spec || {};
  const rawStatus = text(execution.status, "not requested").replace(/_/g, " ");
  const queryReady = view.mode === "query_ready";
  const registered = view.mode === "registered" || queryReady;
  const failed = view.mode === "failed";
  const hasSpec = Boolean(spec.input_dataset_id && spec.output_dataset_id);
  const testId = queryReady ? "synthesis-query-ready-state" : registered ? "synthesis-registered-state" : failed ? "synthesis-failed-state" : "synthesis-execution-state";

  return (
    <section className="rd-loop7-execution" data-testid={testId}>
      <header>
        <div><small>Governed execution proof</small><h2>{view.outputContract.datasetId || "No execution requested"}</h2></div>
        <span className={registered ? "success" : failed ? "warn" : "neutral"}>{queryReady ? "Query ready" : registered ? "Registered" : facultyStateLabel(execution.status, "Execution not requested")}</span>
      </header>
      <div className="rd-loop7-execution-proof">
        <dl>
          <div><dt>Input</dt><dd>{text(spec.input_dataset_id, "Not reported")}</dd></div>
          <div><dt>Output</dt><dd>{text(spec.output_dataset_id, "Not reported")}</dd></div>
          <div><dt>Rows</dt><dd>{execution.rows == null ? "Not reported" : Number(execution.rows).toLocaleString()}</dd></div>
        </dl>
        <dl>
          <div><dt>Worker state</dt><dd>{rawStatus}</dd></div>
          <div><dt>Archive</dt><dd>{execution.drive_verified ? "Reported verified" : "Not reported"}</dd></div>
          <div><dt>Manifest</dt><dd className="mono">{text(execution.manifest_id, "Not reported")}</dd></div>
        </dl>
        <dl>
          <div><dt>Registry</dt><dd>{queryReady ? "Query-ready output reported" : registered ? "Registered output reported" : "Not claimed"}</dd></div>
          <div><dt>Analysis</dt><dd>{queryReady ? "Ready for analysis" : registered ? "Registration does not imply query readiness" : "Not established"}</dd></div>
          <div><dt>Job</dt><dd className="mono">{text(execution.job_id, "Not requested")}</dd></div>
        </dl>
      </div>
      {failed ? <p className="s04-fixture">{text(execution.error, "Execution failed without a recorded error detail.")}</p> : null}
      <footer>
        {registered ? (
          <button
            type="button"
            className="rd-v2-btn primary"
            aria-label="Open in Library"
            onClick={() => onOpenDataset?.({ dataset_id: view.outputContract.datasetId, name: view.outputContract.datasetId, analysis_readiness: queryReady ? "instant" : "registered" })}
          >
            {RESEARCH_ACTIONS.inspectEvidence}
          </button>
        ) : null}
        {!registered && hasSpec ? (
          <button type="button" className="rd-v2-btn primary" aria-label="Request execution" disabled={busy || Boolean(execution.status)} onClick={onRequest}>
            {RESEARCH_ACTIONS.requestExecution}
          </button>
        ) : null}
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Explain the exact execution proof, unresolved authority, and next required decision.", "output_contract")}>Inspect execution proof in Composer</button>
      </footer>
    </section>
  );
}

function NewConstruction({ objective, setObjective, busy, onCreate, onAsk }) {
  return (
    <section className="s04-intent rd-loop7-new-construction" data-testid="synthesis-intent-state">
      <small>New research construction</small>
      <h2>What research question should become governed evidence?</h2>
      <textarea rows={7} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="State the question, unit of analysis, population, period, known evidence, or uncertainty…" />
      <footer>
        <button type="button" className="rd-v2-btn" disabled={!objective.trim()} onClick={() => onAsk(objective, "question")}>Explore question in Composer</button>
        <button type="button" className="rd-v2-btn primary" aria-label="Create thread & discuss" disabled={busy || !objective.trim()} onClick={onCreate}>Create construction</button>
      </footer>
    </section>
  );
}

function EmptyWorkspace({ onNew }) {
  return (
    <section className="s04-intent rd-loop7-new-construction" data-testid="synthesis-empty-state">
      <small>Research construction</small>
      <h2>No faculty-facing construction is established</h2>
      <button type="button" className="rd-v2-btn primary" onClick={onNew}>Create research construction</button>
    </section>
  );
}

export function SynthesisPage({ datasets = [], onAskComposer, onOpenDataset, onSelectThread, onGoTab }) {
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newMode, setNewMode] = useState(false);
  const [objective, setObjective] = useState("");
  const [selectedField, setSelectedField] = useState("construction");
  const notified = useRef("");

  const facultyThreads = useMemo(() => facultyFacingRecords(threads), [threads]);
  const visibleThreads = showTechnical ? threads : facultyThreads;
  const technicalCount = Math.max(0, threads.length - facultyThreads.length);
  const visibleDatasets = useMemo(() => facultyFacingRecords(datasets), [datasets]);

  const replaceThread = useCallback((next) => {
    if (!next?.id) return;
    setThreads((current) => current.some((thread) => thread.id === next.id) ? current.map((thread) => thread.id === next.id ? next : thread) : [next, ...current]);
  }, []);

  const refreshThreads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listSynthesisThreads();
      const next = Array.isArray(result?.threads) ? result.threads : [];
      const faculty = facultyFacingRecords(next);
      const preferred = preferredThread(faculty, visibleDatasets);
      setThreads(next);
      setSelectedId((current) => current && faculty.some((thread) => thread.id === current) ? current : preferred?.id || "");
    } catch (cause) {
      setError(text(cause?.message, "Research constructions could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [visibleDatasets]);

  useEffect(() => { refreshThreads(); }, [refreshThreads]);

  useEffect(() => {
    if (selectedId && visibleThreads.some((thread) => thread.id === selectedId)) return;
    setSelectedId(preferredThread(visibleThreads, visibleDatasets)?.id || "");
  }, [selectedId, visibleThreads, visibleDatasets]);

  const selected = useMemo(() => visibleThreads.find((thread) => thread.id === selectedId) || null, [visibleThreads, selectedId]);
  const view = useMemo(() => normalizeResearchConstruction(selected, visibleDatasets), [selected, visibleDatasets]);

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
    const execution = selected?.state?.execution || {};
    if (!selected || !/pending_approval|queued|claimed|running|registering|archiving/i.test(String(execution.status || ""))) return undefined;
    const timer = window.setInterval(() => refreshThread().catch(() => {}), 4000);
    return () => window.clearInterval(timer);
  }, [selected, refreshThread]);

  const selectThread = async (threadId) => {
    setSelectedId(threadId);
    setNewMode(false);
    setSelectedField("construction");
    setError("");
    try {
      const next = await refreshThread(threadId);
      if (next) onSelectThread?.(next);
    } catch (cause) {
      setError(text(cause?.message, "This research construction could not be refreshed."));
    }
  };

  const ask = (prompt, field = selectedField) => {
    const activeView = view;
    const context = constructionComposerContext(activeView, field);
    const displayText = text(prompt, `Discuss ${field.replace(/_/g, " ")}`);
    onAskComposer?.({
      prompt: `${displayText}\n\n${context}`,
      displayText,
      construction_id: activeView?.id || "",
      selected_field: field,
      accepted_state: activeView?.method?.acceptedDefinition || "",
      available_actions: [RESEARCH_ACTIONS.reviewDecision, RESEARCH_ACTIONS.investigateGap, RESEARCH_ACTIONS.askConstruction],
    });
  };

  const createThread = async () => {
    const nextObjective = objective.trim();
    if (!nextObjective) return;
    setBusy(true);
    setError("");
    try {
      const created = await createSynthesisThread({ objective: nextObjective });
      replaceThread(created);
      setSelectedId(created.id);
      setNewMode(false);
      setSelectedField("question");
      setObjective("");
      onSelectThread?.(created);
      const createdView = normalizeResearchConstruction(created, visibleDatasets);
      onAskComposer?.({
        prompt: `Interpret this research question into explicit construction fields without inventing evidence or method.\n\n${constructionComposerContext(createdView, "question")}`,
        displayText: nextObjective,
        construction_id: created.id,
        selected_field: "question",
      });
    } catch (cause) {
      setError(text(cause?.message, "The research construction could not be created."));
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
      const next = await decideSynthesisProposal(selected.id, { decision, proposalId: proposal.id, proposalHash: proposal.proposal_hash });
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
      const result = await requestSynthesisExecution(selected.id);
      const next = result?.thread || (result?.state ? result : await refreshThread(selected.id));
      if (next) { replaceThread(next); onSelectThread?.(next); }
    } catch (cause) {
      setError(text(cause?.message, "The governed execution request could not be created."));
      refreshThread().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => { setNewMode(true); setObjective(""); setSelectedField("question"); };
  const showExecution = Boolean(view && ["execution", "registered", "query_ready", "failed"].includes(view.mode));

  return (
    <PageShell className="rd-v2-synthesis-page rd-rc3-synthesis-page rd-loop7-synthesis-page" title="Synthesis" lead="Govern one research construction through evidence, method, decisions, and verified output.">
      <div className="s04-shell rd-rc3-synthesis-shell rd-loop7-synthesis-shell" data-testid="synthesis-studio">
        <ThreadList
          threads={visibleThreads}
          datasets={visibleDatasets}
          selectedId={selectedId}
          loading={loading}
          technicalCount={technicalCount}
          showTechnical={showTechnical}
          onToggleTechnical={() => setShowTechnical((visible) => !visible)}
          onSelect={selectThread}
          onNew={startNew}
        />
        <main className="s04-main rd-loop7-main">
          {error ? <p className="s04-fixture" role="alert">{error}</p> : null}
          {newMode ? <NewConstruction objective={objective} setObjective={setObjective} busy={busy} onCreate={createThread} onAsk={ask} /> : null}
          {!newMode && !loading && !view ? <EmptyWorkspace onNew={startNew} /> : null}
          {!newMode && view ? (
            <>
              <ConstructionCanvas
                view={view}
                selectedField={selectedField}
                onSelectField={(field) => setSelectedField(field)}
                onAsk={ask}
                onGoTab={onGoTab}
                onOpenDataset={onOpenDataset}
              />
              {view.mode === "proposal" ? <ProposalReview view={view} busy={busy} onDecide={decideProposal} onAsk={ask} /> : null}
              {showExecution ? <ExecutionRecord view={view} busy={busy} onRequest={requestExecution} onAsk={ask} onOpenDataset={onOpenDataset} /> : null}
            </>
          ) : null}
        </main>
      </div>
    </PageShell>
  );
}

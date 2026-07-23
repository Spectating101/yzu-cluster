import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/v2/ui";
import {
  createSynthesisThread,
  decideSynthesisProposal,
  getSynthesisThread,
  listSynthesisThreads,
  requestSynthesisExecution,
} from "@/v2/api";
import { displayName, statusPill } from "@/v2/datasetMeta";
import { facultyFacingRecords } from "@/v2/productVisibility";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function titleFor(thread) {
  return text(thread?.title || thread?.state?.title, "Untitled synthesis");
}

function stateFor(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const lifecycle = text(execution.status || thread?.materialisation).toLowerCase().replace(/-/g, "_");
  if (lifecycle === "query_ready") return "query_ready";
  if (lifecycle === "registered") return "registered";
  if (lifecycle === "failed") return "failed";
  if (execution.status) return "execution";
  if (state.proposal) return "proposal";
  if ((state.nodes || []).length) return "explore";
  return "draft";
}

function stageLabel(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const mode = stateFor(thread);
  if (mode === "query_ready") return "Query-ready output";
  if (mode === "registered") return "Registered output";
  if (mode === "failed") return "Execution failed";
  if (execution.status) return text(execution.status).replace(/_/g, " ");
  if (state.proposal) return "Proposal needs review";
  return text(state.maturityLabel || state.maturity, mode === "draft" ? "New thread" : "Exploring construction");
}

function threadStatus(thread) {
  const mode = stateFor(thread);
  if (mode === "query_ready") return "Query ready";
  if (mode === "registered") return "Registered";
  if (mode === "failed") return "Needs recovery";
  if (thread?.state?.execution?.status) return text(thread.state.execution.status).replace(/_/g, " ");
  if (thread?.state?.proposal) return "Review proposal";
  return text(thread?.state?.maturityLabel || thread?.state?.maturity, "Exploring");
}

function threadOutput(thread) {
  const state = thread?.state || {};
  return state.execution?.output_dataset_id || state.execution_spec?.output_dataset_id || "";
}

function evidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

function targetNode(thread) {
  return (thread?.state?.nodes || []).find((node) => node?.layer === "target" || node?.type === "target");
}

function isMissingNode(node) {
  return /missing|needs_access|sourceable|blocked|unknown/i.test(String(node?.status || node?.state || ""));
}

function preferredThread(threads) {
  const substantive = threads.find((thread) => {
    const title = titleFor(thread);
    const objective = text(thread?.objective || thread?.state?.objective);
    const generic = /^(?:new|untitled) synthesis$/i.test(title);
    return !generic && (objective.length >= 24 || evidenceNodes(thread).length > 0);
  });
  return substantive || threads[0] || null;
}

function ThreadList({
  threads,
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
    <aside className="s04-threads rd-rc3-synthesis-threads" aria-label="Synthesis threads">
      <header>
        <div><span>Research constructions</span><small>{loading ? "Loading" : `${threads.length} visible`}</small></div>
        <button type="button" className="s04-thread-new" onClick={onNew}>+ New</button>
      </header>
      {threads.map((thread) => (
        <button
          type="button"
          key={thread.id}
          ref={thread.id === selectedId ? selectedRef : null}
          className={thread.id === selectedId ? "active" : ""}
          onClick={() => onSelect(thread.id)}
          data-testid="synthesis-thread-item"
        >
          <b>{["registered", "query_ready"].includes(stateFor(thread)) ? "✓" : stateFor(thread) === "failed" ? "!" : "S"}</b>
          <span><strong>{titleFor(thread)}</strong><small>{threadStatus(thread)}</small></span>
        </button>
      ))}
      {!loading && !threads.length ? <p className="s04-thread-empty">No faculty-facing Synthesis threads yet.</p> : null}
      <footer>
        <small>Durable thread memory</small>
        <p>Evidence, decisions, sourcing branches, execution, and outputs remain attached to the construction.</p>
        {technicalCount ? (
          <button type="button" className="rd-v2-btn sm" onClick={onToggleTechnical}>
            {showTechnical ? "Hide technical threads" : `Show technical threads (${technicalCount})`}
          </button>
        ) : null}
      </footer>
    </aside>
  );
}

function ThreadHeader({ thread }) {
  const state = thread?.state || {};
  const mode = stateFor(thread);
  const queryReady = mode === "query_ready";
  const registered = mode === "registered" || queryReady;
  return (
    <>
      <header className="s04-head rd-rc3-synthesis-head">
        <div>
          <small>{stageLabel(thread)}</small>
          <h1>{titleFor(thread)}</h1>
          <p>{text(thread?.objective || state.objective, "A durable research-construction thread.")}</p>
        </div>
        <em>{queryReady ? "Query-ready evidence" : registered ? "Registered evidence" : state.proposal ? "Reviewable change" : "No output claimed"}</em>
      </header>
      <div className="s04-brief rd-rc3-synthesis-brief">
        <span><small>Current research state</small>{text(state.lastActivity, "Explore evidence and method before accepting a durable proposal.")}</span>
        <span className="s04-brief-grain"><small>Required grain</small>{text(state.required_grain || state.spec?.grain, "Not specified")}</span>
      </div>
    </>
  );
}

function nodeLabel(node) {
  return text(node?.label || node?.dataset_id || node?.title, "Unnamed evidence");
}

function mappedDataset(node, datasets) {
  const id = node?.dataset_id || node?.id;
  return datasets.find((dataset) => dataset.dataset_id === id) || null;
}

function EvidenceItem({ node, datasets }) {
  const held = mappedDataset(node, datasets);
  const missing = isMissingNode(node);
  return (
    <article className={`rd-rc3-evidence-item${missing ? " missing" : ""}`}>
      <div>
        <small>{text(node?.role || node?.eyebrow || node?.status, missing ? "Evidence gap" : "Mapped evidence")}</small>
        <strong>{nodeLabel(node)}</strong>
        <span>{[node?.grain || held?.grain, node?.coverage || held?.coverage].filter(Boolean).join(" · ") || "Coverage and grain not reported"}</span>
      </div>
      <em>{missing ? "Missing" : held ? statusPill(held) : text(node?.status, "Mapped")}</em>
    </article>
  );
}

function ConstructionWorkspace({ thread, datasets, onAsk, onGoTab }) {
  const target = targetNode(thread);
  const evidence = evidenceNodes(thread);
  const missing = evidence.filter(isMissingNode);
  const available = evidence.filter((node) => !isMissingNode(node));
  const state = thread?.state || {};
  const fallbackAssets = datasets.slice(0, 4);
  const output = text(target?.label || state.execution_spec?.output_dataset_id, "Reusable research asset");
  const method = text(state.spec?.summary || state.spec?.method, "No formal method has been accepted.");

  const investigate = () => {
    const gapNames = missing.map(nodeLabel).join(", ") || "the evidence still required by this construction";
    onAsk?.(
      `Investigate missing evidence for this Synthesis construction. Required gaps: ${gapNames}. Preserve the target grain, coverage, and research purpose; search held assets first, then compare realistic external acquisition routes.`,
    );
    onGoTab?.("browse");
  };

  return (
    <section className="s04-card rd-rc3-construction" data-testid="synthesis-evidence-state">
      <header className="rd-rc3-construction-title">
        <div><small>Exploratory construction</small><h2>{output}</h2><p>{method}</p></div>
        <span>{missing.length ? `${missing.length} evidence gap${missing.length === 1 ? "" : "s"}` : "No recorded gap"}</span>
      </header>

      <div className="rd-rc3-construction-grid">
        <section>
          <header><span>01</span><div><strong>Available evidence</strong><small>Held or already mapped to the construction</small></div></header>
          <div>
            {available.length ? available.map((node) => <EvidenceItem key={node.id || nodeLabel(node)} node={node} datasets={datasets} />) : fallbackAssets.length ? fallbackAssets.map((dataset) => (
              <article key={dataset.dataset_id} className="rd-rc3-evidence-item">
                <div><small>Held candidate</small><strong>{displayName(dataset)}</strong><span>{[dataset.grain, dataset.coverage].filter(Boolean).join(" · ") || "Metadata not reported"}</span></div>
                <em>{statusPill(dataset)}</em>
              </article>
            )) : <p>No held evidence is mapped yet.</p>}
          </div>
        </section>

        <section className="rd-rc3-construction-method">
          <header><span>02</span><div><strong>Construction logic</strong><small>What the thread is currently trying to make</small></div></header>
          <div className="rd-rc3-construction-flow" role="img" aria-label="Current Synthesis construction">
            <span>Inputs</span><b>↓</b><strong>{text(state.required_grain || state.spec?.grain, "Grain unresolved")}</strong><b>↓</b><span>{method}</span><b>↓</b><strong>{output}</strong>
          </div>
          <div className="rd-rc3-method-questions">
            <small>Methodological boundary</small>
            <p>Ask may revise the construction, but no method or output becomes durable until an exact proposal revision is accepted.</p>
          </div>
        </section>

        <section>
          <header><span>03</span><div><strong>Missing evidence</strong><small>What prevents the full research object from being defensible</small></div></header>
          <div>
            {missing.length ? missing.map((node) => <EvidenceItem key={node.id || nodeLabel(node)} node={node} datasets={datasets} />) : <p>No missing source is recorded. This is not a claim that conceptual coverage is complete.</p>}
          </div>
          <button type="button" className="rd-v2-btn primary rd-rc3-discover-handoff" onClick={investigate}>
            Investigate missing evidence in Discover →
          </button>
        </section>
      </div>

      <footer className="s04-actions">
        <p><small>Next</small>Challenge the construction, add constraints, compare alternatives, or ask for the smallest defensible formal proposal.</p>
        <button type="button" className="rd-v2-btn primary" onClick={() => onAsk("Explain this construction, identify its strongest alternative, and state the next material research decision.")}>Develop in Ask</button>
      </footer>
    </section>
  );
}

function ProposalReview({ thread, busy, onDecide, onAsk }) {
  const proposal = thread?.state?.proposal || {};
  const operations = Array.isArray(proposal.operations) ? proposal.operations : [];
  const canDecide = Boolean(proposal.id && proposal.proposal_hash);
  const spec = proposal.execution_spec || {};
  return (
    <section className="s04-card rd-rc3-proposal" data-testid="synthesis-proposal-state">
      <header className="s04-title">
        <div><small>Controlled proposal</small><h2>{text(proposal.title, "Untitled proposal")}</h2></div>
        <em className="warn">Review required</em>
      </header>
      <div className="rd-rc3-proposal-summary">
        <section><small>Research meaning</small><strong>{text(proposal.summary, "The agent proposed a durable change to this construction.")}</strong><p>Acceptance applies only to the exact revision shown here.</p></section>
        <section><small>Output contract</small><dl><div><dt>Input</dt><dd>{text(spec.input_dataset_id, "Not reported")}</dd></div><div><dt>Output</dt><dd>{text(spec.output_dataset_id, "Not reported")}</dd></div><div><dt>Grain</dt><dd>{Array.isArray(spec.group_by) ? spec.group_by.join(" × ") : "Not reported"}</dd></div></dl></section>
      </div>
      <div className="rd-rc3-operation-list">
        <header><strong>Proposed state changes</strong><span>{operations.length || "Unreported"}</span></header>
        {operations.length ? operations.slice(0, 10).map((operation, index) => (
          <div key={`${operation.op || operation.type || "change"}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{text(operation.summary || operation.label || operation.path || operation.op || operation.type, "Structured state change")}</strong></div>
        )) : <p>No operation summary was returned. Challenge this proposal before deciding.</p>}
      </div>
      {!canDecide ? <p className="s04-fixture">This proposal has no revision hash, so it cannot be accepted from the desk. Refresh it through Ask.</p> : null}
      <footer className="s04-actions">
        <p><small>Approval boundary</small>A changed proposal must be reviewed again; acceptance cannot be inferred from conversation.</p>
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Challenge this proposal and explain every methodological and data consequence.")}>Challenge in Ask</button>
        <button type="button" className="rd-v2-btn" disabled={busy || !canDecide} onClick={() => onDecide("reject")}>Reject</button>
        <button type="button" className="rd-v2-btn primary" disabled={busy || !canDecide} onClick={() => onDecide("accept")}>Accept proposal</button>
      </footer>
    </section>
  );
}

function ExecutionRecord({ thread, busy, onRequest, onAsk, onOpenDataset }) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const spec = state.execution_spec || {};
  const status = text(execution.status, "not requested").replace(/_/g, " ");
  const outputId = threadOutput(thread);
  const mode = stateFor(thread);
  const queryReady = mode === "query_ready";
  const registered = mode === "registered" || queryReady;
  const failed = execution.status === "failed";
  const hasSpec = Boolean(spec.input_dataset_id && spec.output_dataset_id);

  return (
    <section className="s04-card rd-rc3-execution" data-testid={queryReady ? "synthesis-query-ready-state" : registered ? "synthesis-registered-state" : failed ? "synthesis-failed-state" : "synthesis-execution-state"}>
      <header className="s04-title"><div><small>{queryReady ? "Query-ready research asset" : registered ? "Registered research asset" : failed ? "Execution failed" : "Execution and validation"}</small><h2>{registered ? text(outputId, "Registered output") : text(spec.output_dataset_id, "No execution requested")}</h2></div><em className={registered ? "success" : failed ? "warn" : "neutral"}>{queryReady ? "Query ready" : registered ? "Registered" : status}</em></header>
      <div className="rd-rc3-execution-grid">
        <section><small>Specification</small><dl><div><dt>Input</dt><dd>{text(spec.input_dataset_id, "Not reported")}</dd></div><div><dt>Output</dt><dd>{text(spec.output_dataset_id, "Not reported")}</dd></div><div><dt>Group by</dt><dd>{Array.isArray(spec.group_by) ? spec.group_by.join(" · ") : "Not reported"}</dd></div><div><dt>Metrics</dt><dd>{Array.isArray(spec.metrics) ? `${spec.metrics.length} defined` : "Not reported"}</dd></div></dl></section>
        <section><small>Execution evidence</small><dl><div><dt>Job</dt><dd>{text(execution.job_id, "Not requested")}</dd></div><div><dt>Rows</dt><dd>{execution.rows == null ? "Not reported" : Number(execution.rows).toLocaleString()}</dd></div><div><dt>Manifest</dt><dd>{text(execution.manifest_id, "Not reported")}</dd></div></dl></section>
        <section><small>Registration truth</small><dl><div><dt>Archive</dt><dd>{execution.drive_verified ? "Reported verified" : "Not reported"}</dd></div><div><dt>Registry</dt><dd>{queryReady ? "Query-ready output reported" : registered ? "Registered output reported" : "Not claimed"}</dd></div><div><dt>Output</dt><dd>{text(outputId, "Not registered")}</dd></div></dl></section>
      </div>
      {failed ? <p className="s04-fixture">{text(execution.error, "The execution failed without a recorded error detail.")}</p> : null}
      <footer className="s04-actions">
        <p><small>Truth boundary</small>{queryReady ? "The thread reports a query-ready output." : registered ? "The thread reports registration; query readiness is not implied." : hasSpec ? "Execution creates a durable job; registration remains a separate verified outcome." : "An accepted execution specification is required before build."}</p>
        {registered ? <button type="button" className="rd-v2-btn primary" onClick={() => onOpenDataset?.({ dataset_id: outputId, name: outputId, analysis_readiness: "instant" })}>Open in Library</button> : null}
        {!registered && hasSpec ? <button type="button" className="rd-v2-btn primary" disabled={busy || Boolean(execution.status)} onClick={onRequest}>Request execution</button> : null}
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Explain the exact execution state and what remains unverified.")}>Ask about execution</button>
      </footer>
    </section>
  );
}

function NewThread({ objective, setObjective, busy, onCreate, onAsk }) {
  return (
    <section className="s04-intent rd-rc3-synthesis-intent" data-testid="synthesis-intent-state">
      <small>Open-ended construction</small>
      <h2>What might become a reusable research asset?</h2>
      <p>Begin with a question, a rough method, several assets, or an unresolved relationship. Synthesis may discover that the required evidence is missing and hand that need to Discover.</p>
      <textarea rows={7} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the research question, possible evidence, period, grain, or uncertainty…" />
      <footer><span>A durable thread is created before formal method or execution claims.</span><button type="button" className="rd-v2-btn" disabled={!objective.trim()} onClick={() => onAsk(objective)}>Explore first</button><button type="button" className="rd-v2-btn primary" disabled={busy || !objective.trim()} onClick={onCreate}>Create thread &amp; discuss</button></footer>
    </section>
  );
}

function EmptyWorkspace({ onNew }) {
  return (
    <section className="s04-intent rd-rc3-synthesis-intent" data-testid="synthesis-empty-state">
      <small>Synthesis</small><h2>Explore a construction before committing to a specification</h2><p>Bring held assets, a question, or an incomplete idea. Research Drive keeps evidence gaps visible and can investigate missing inputs through Discover.</p><footer><span>No local sample is substituted for missing work.</span><button type="button" className="rd-v2-btn primary" onClick={onNew}>New synthesis</button></footer>
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
  const notified = useRef("");

  const facultyThreads = useMemo(() => facultyFacingRecords(threads), [threads]);
  const visibleThreads = showTechnical ? threads : facultyThreads;
  const technicalCount = Math.max(0, threads.length - facultyThreads.length);
  const visibleDatasets = useMemo(() => facultyFacingRecords(datasets), [datasets]);

  const replaceThread = useCallback((next) => {
    if (!next?.id) return;
    setThreads((current) => current.some((thread) => thread.id === next.id) ? current.map((thread) => thread.id === next.id ? next : thread) : [next, ...current]);
  }, []);

  const refreshThreads = useCallback(async ({ keepLoading = false } = {}) => {
    if (!keepLoading) setLoading(true);
    setError("");
    try {
      const result = await listSynthesisThreads();
      const next = Array.isArray(result?.threads) ? result.threads : [];
      const faculty = facultyFacingRecords(next);
      const preferred = preferredThread(faculty);
      setThreads(next);
      setSelectedId((current) => current && faculty.some((thread) => thread.id === current) ? current : preferred?.id || "");
    } catch (cause) {
      setError(text(cause?.message, "Synthesis threads could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshThreads(); }, [refreshThreads]);

  useEffect(() => {
    if (selectedId && visibleThreads.some((thread) => thread.id === selectedId)) return;
    setSelectedId(preferredThread(visibleThreads)?.id || "");
  }, [selectedId, visibleThreads]);

  const selected = useMemo(() => visibleThreads.find((thread) => thread.id === selectedId) || null, [visibleThreads, selectedId]);

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
    if (!selected || !/pending_approval|queued|running|registering|archiving/i.test(String(execution.status || ""))) return undefined;
    const timer = window.setInterval(() => refreshThread().catch(() => {}), 4000);
    return () => window.clearInterval(timer);
  }, [selected, refreshThread]);

  const selectThread = async (threadId) => {
    setSelectedId(threadId);
    setNewMode(false);
    setError("");
    try {
      const next = await refreshThread(threadId);
      if (next) onSelectThread?.(next);
    } catch (cause) {
      setError(text(cause?.message, "This Synthesis thread could not be refreshed."));
    }
  };

  const ask = (prompt) => {
    const context = selected ? `\n\nSynthesis thread: ${titleFor(selected)}\nObjective: ${text(selected.objective || selected.state?.objective)}\nDurable status: ${stageLabel(selected)}.` : "\n\nSynthesis workspace context.";
    onAskComposer?.({ prompt: `${text(prompt)}${context}`, displayText: text(prompt, "Discuss this synthesis") });
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
      setObjective("");
      onSelectThread?.(created);
      ask(`Interpret this research objective and propose several defensible constructions before formalizing one: ${nextObjective}`);
    } catch (cause) {
      setError(text(cause?.message, "The Synthesis thread could not be created."));
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
      setError(text(cause?.message, "The execution request could not be created."));
      refreshThread().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const mode = stateFor(selected);
  const showExecution = Boolean(selected && (mode === "execution" || mode === "registered" || mode === "query_ready" || mode === "failed" || selected.state?.execution_spec));

  return (
    <PageShell className="rd-v2-synthesis-page rd-rc3-synthesis-page" title="Synthesis" lead="Develop research constructions from held evidence, keep missing inputs visible, and formalize only exact reviewable proposals.">
      <div className="s04-shell rd-rc3-synthesis-shell" data-testid="synthesis-studio">
        <ThreadList
          threads={visibleThreads}
          selectedId={selectedId}
          loading={loading}
          technicalCount={technicalCount}
          showTechnical={showTechnical}
          onToggleTechnical={() => setShowTechnical((visible) => !visible)}
          onSelect={selectThread}
          onNew={() => { setNewMode(true); setObjective(""); }}
        />
        <main className="s04-main">
          {error ? <p className="s04-fixture" role="alert">{error}</p> : null}
          {newMode ? <NewThread objective={objective} setObjective={setObjective} busy={busy} onCreate={createThread} onAsk={ask} /> : null}
          {!newMode && !loading && !selected ? <EmptyWorkspace onNew={() => setNewMode(true)} /> : null}
          {!newMode && selected ? (
            <>
              <ThreadHeader thread={selected} />
              {mode === "proposal" ? <ProposalReview thread={selected} busy={busy} onDecide={decideProposal} onAsk={ask} /> : null}
              {showExecution ? <ExecutionRecord thread={selected} busy={busy} onRequest={requestExecution} onAsk={ask} onOpenDataset={onOpenDataset} /> : null}
              {mode === "explore" ? <ConstructionWorkspace thread={selected} datasets={visibleDatasets} onAsk={ask} onGoTab={onGoTab} /> : null}
              {mode === "draft" ? <EmptyWorkspace onNew={() => setNewMode(true)} /> : null}
            </>
          ) : null}
        </main>
      </div>
    </PageShell>
  );
}

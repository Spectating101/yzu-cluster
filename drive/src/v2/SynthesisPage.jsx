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
import { normalizeResearchConstruction } from "@/v2/ResearchConstructionViewModel";
import {
  normalizeProxyDatasetDesign,
  proxyComposerContext,
} from "@/v2/ProxyDatasetDesignViewModel";
import { SynthesisProxyCanvas } from "@/v2/SynthesisProxyCanvas";
import { facultyStateLabel, RESEARCH_ACTIONS } from "@/v2/researchValue";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function preferredThread(threads, datasets) {
  const substantive = threads.find((thread) => {
    const view = normalizeProxyDatasetDesign(thread, datasets);
    const generic = /^(?:new|untitled) (?:synthesis|research construction)$/i.test(view?.title || "");
    return view && !generic && (
      view.primaryRecipe
      || view.ingredients.length
      || view.target.description.length >= 24
    );
  });
  return substantive || threads[0] || null;
}

function threadStatus(proxy, construction) {
  if (!proxy || !construction) return "State not established";
  if (proxy.mode === "query_ready") return "Proxy dataset ready for analysis";
  if (proxy.mode === "registered") return "Proxy dataset registered";
  if (proxy.mode === "failed") return "Build needs recovery";
  if (proxy.mode === "proposal") return "Proxy revision waiting";
  if (proxy.mode === "execution") {
    return facultyStateLabel(proxy.raw?.state?.execution?.status, "Execution state not established");
  }
  if (!proxy.primaryRecipe) return "Proxy recommendation not generated";
  if (!proxy.capability.acceptedConstruction) return "Recommended proxy ready to review";
  if (construction.method.state !== "accepted") return "Synthesis recipe needs a decision";
  return "Proxy design active";
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
    <aside className="s04-threads rd-rc3-synthesis-threads rd-loop7-thread-list" aria-label="Proxy dataset designs">
      <header>
        <div><span>Proxy dataset designs</span><small>{loading ? "Loading" : `${threads.length} visible`}</small></div>
        <button type="button" className="s04-thread-new" aria-label="+ New" onClick={onNew}>New proxy design</button>
      </header>
      <div className="rd-loop7-thread-items">
        {threads.map((thread) => {
          const proxy = normalizeProxyDatasetDesign(thread, datasets);
          const construction = normalizeResearchConstruction(thread, datasets);
          return (
            <button
              type="button"
              key={thread.id}
              ref={thread.id === selectedId ? selectedRef : null}
              className={thread.id === selectedId ? "active" : ""}
              onClick={() => onSelect(thread.id)}
              data-testid="synthesis-thread-item"
            >
              <b>{["registered", "query_ready"].includes(proxy.mode) ? "✓" : proxy.mode === "failed" ? "!" : "P"}</b>
              <span><strong>{proxy.target.label}</strong><small>{threadStatus(proxy, construction)}</small></span>
            </button>
          );
        })}
      </div>
      {!loading && !threads.length ? <p className="s04-thread-empty">No faculty-facing proxy dataset design exists yet.</p> : null}
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

function proposalAffectedFields(proposal) {
  const fields = (Array.isArray(proposal?.operations) ? proposal.operations : [])
    .map((operation) => text(operation.field || operation.path || operation.op || operation.type))
    .filter(Boolean)
    .map((value) => value.replace(/^state\.?/, "").replace(/[_.-]+/g, " "));
  return [...new Set(fields)];
}

function ProposalReview({ construction, busy, onDecide, onAsk }) {
  const proposal = construction.raw?.state?.proposal || {};
  const affected = proposalAffectedFields(proposal);
  const canDecide = Boolean(proposal.id && proposal.proposal_hash);
  return (
    <section className="rd-loop7-proposal" data-testid="synthesis-proposal-state">
      <header>
        <div><small>Proposed proxy revision</small><h2>{text(proposal.title, "Untitled proposed change")}</h2></div>
        <span>Exact revision review</span>
      </header>
      <p className="rd-loop7-proposal-definition">{text(proposal.summary, "The proposal did not provide a proxy-design definition.")}</p>
      <div className="rd-loop7-proposal-fields">
        <span>Affected fields</span>
        {affected.length ? <ul>{affected.map((field) => <li key={field}>{field}</li>)}</ul> : <p>Structured affected fields were not reported.</p>}
      </div>
      {!canDecide ? <p className="s04-fixture">This proposal has no revision hash, so it cannot be accepted from the desk.</p> : null}
      <footer>
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Challenge this exact proxy revision and identify every construct-validity, evidence-role, transformation, and output consequence.", "proxy_recipes")}>Review proxy rationale</button>
        <button type="button" className="rd-v2-btn" aria-label="Reject" disabled={busy || !canDecide} onClick={() => onDecide("reject")}>Reject proposed change</button>
        <button type="button" className="rd-v2-btn primary" aria-label="Accept proposal" disabled={busy || !canDecide} onClick={() => onDecide("accept")}>Accept proposed change</button>
      </footer>
    </section>
  );
}

function ExecutionRecord({ construction, busy, onRequest, onAsk, onOpenDataset }) {
  const execution = construction.raw?.state?.execution || {};
  const spec = construction.raw?.state?.execution_spec || {};
  const rawStatus = text(execution.status, "not requested").replace(/_/g, " ");
  const queryReady = construction.mode === "query_ready";
  const registered = construction.mode === "registered" || queryReady;
  const failed = construction.mode === "failed";
  const hasSpec = Boolean(spec.input_dataset_id && spec.output_dataset_id);
  const testId = queryReady ? "synthesis-query-ready-state" : registered ? "synthesis-registered-state" : failed ? "synthesis-failed-state" : "synthesis-execution-state";

  return (
    <section className="rd-loop7-execution" data-testid={testId}>
      <header>
        <div><small>Governed proxy build</small><h2>{construction.outputContract.datasetId || "No build requested"}</h2></div>
        <span className={registered ? "success" : failed ? "warn" : "neutral"}>{queryReady ? "Query ready" : registered ? "Registered" : facultyStateLabel(execution.status, "Build not requested")}</span>
      </header>
      <div className="rd-loop7-execution-proof">
        <dl>
          <div><dt>Input</dt><dd>{text(spec.input_dataset_id, "Not reported")}</dd></div>
          <div><dt>Output</dt><dd>{text(spec.output_dataset_id, "Not reported")}</dd></div>
          <div><dt>Rows</dt><dd>{execution.rows == null ? "Not reported" : Number(execution.rows).toLocaleString()}</dd></div>
        </dl>
        <dl>
          <div><dt>Build state</dt><dd>{rawStatus}</dd></div>
          <div><dt>Archive</dt><dd>{execution.drive_verified ? "Reported verified" : "Not reported"}</dd></div>
          <div><dt>Manifest</dt><dd className="mono">{text(execution.manifest_id, "Not reported")}</dd></div>
        </dl>
        <dl>
          <div><dt>Registry</dt><dd>{queryReady ? "Query-ready output reported" : registered ? "Registered output reported" : "Not claimed"}</dd></div>
          <div><dt>Analysis</dt><dd>{queryReady ? "Ready for analysis" : registered ? "Registration does not imply query readiness" : "Not established"}</dd></div>
          <div><dt>Job</dt><dd className="mono">{text(execution.job_id, "Not requested")}</dd></div>
        </dl>
      </div>
      {failed ? <p className="s04-fixture">{text(execution.error, "The proxy build failed without a recorded error detail.")}</p> : null}
      <footer>
        {registered ? (
          <button
            type="button"
            className="rd-v2-btn primary"
            aria-label="Open in Library"
            onClick={() => onOpenDataset?.({ dataset_id: construction.outputContract.datasetId, name: construction.outputContract.datasetId, analysis_readiness: queryReady ? "instant" : "registered" })}
          >
            {RESEARCH_ACTIONS.inspectEvidence}
          </button>
        ) : null}
        {!registered && hasSpec ? (
          <button type="button" className="rd-v2-btn primary" aria-label="Request execution" disabled={busy || Boolean(execution.status)} onClick={onRequest}>
            Build proxy dataset
          </button>
        ) : null}
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Explain the exact build proof, unresolved authority, and next required decision for this proxy dataset.", "output_contract")}>Inspect build proof in Composer</button>
      </footer>
    </section>
  );
}

function NewConstruction({ objective, setObjective, busy, onCreate, onAsk }) {
  return (
    <section className="s04-intent rd-loop7-new-construction" data-testid="synthesis-intent-state">
      <small>New proxy dataset design</small>
      <h2>What variable or research asset should the lab reconstruct?</h2>
      <textarea rows={7} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the target construct, desired grain and coverage, intended research use, and evidence already controlled…" />
      <footer>
        <button type="button" className="rd-v2-btn" disabled={!objective.trim()} onClick={() => onAsk(objective, "target_construct")}>Explore proxy designs in Composer</button>
        <button type="button" className="rd-v2-btn primary" aria-label="Create thread & discuss" disabled={busy || !objective.trim()} onClick={onCreate}>Create proxy design</button>
      </footer>
    </section>
  );
}

function EmptyWorkspace({ onNew }) {
  return (
    <section className="s04-intent rd-loop7-new-construction" data-testid="synthesis-empty-state">
      <small>Proxy dataset design</small>
      <h2>No faculty-facing proxy design is established</h2>
      <button type="button" className="rd-v2-btn primary" onClick={onNew}>Create proxy design</button>
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
  const [selectedArea, setSelectedArea] = useState("proxy_design");
  const notified = useRef("");

  const facultyThreads = useMemo(() => facultyFacingRecords(threads), [threads]);
  const visibleThreads = showTechnical ? threads : facultyThreads;
  const technicalCount = Math.max(0, threads.length - facultyThreads.length);
  const visibleDatasets = useMemo(() => facultyFacingRecords(datasets), [datasets]);

  const replaceThread = useCallback((next) => {
    if (!next?.id) return;
    setThreads((current) => current.some((thread) => thread.id === next.id)
      ? current.map((thread) => thread.id === next.id ? next : thread)
      : [next, ...current]);
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
      setError(text(cause?.message, "Proxy dataset designs could not be loaded."));
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
  const construction = useMemo(() => normalizeResearchConstruction(selected, visibleDatasets), [selected, visibleDatasets]);
  const proxy = useMemo(() => normalizeProxyDatasetDesign(selected, visibleDatasets), [selected, visibleDatasets]);

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
    setSelectedArea("proxy_design");
    setError("");
    try {
      const next = await refreshThread(threadId);
      if (next) onSelectThread?.(next);
    } catch (cause) {
      setError(text(cause?.message, "This proxy dataset design could not be refreshed."));
    }
  };

  const ask = (prompt, area = selectedArea) => {
    const context = proxyComposerContext(proxy, area);
    const displayText = text(prompt, `Discuss ${area.replace(/_/g, " ")}`);
    onAskComposer?.({
      prompt: `${displayText}\n\n${context}`,
      displayText,
      construction_id: proxy?.id || "",
      selected_field: area,
      accepted_state: proxy?.primaryRecipe?.summary || "",
      available_actions: ["Generate proxy recipes", "Challenge proxy design", "Review proxy revision", "Find additional evidence"],
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
      setSelectedArea("target_construct");
      setObjective("");
      onSelectThread?.(created);
      const createdProxy = normalizeProxyDatasetDesign(created, visibleDatasets);
      onAskComposer?.({
        prompt: `Interpret this objective as a target construct and propose the strongest defensible proxy dataset designs from controlled evidence. Return one recommendation and explicit alternatives with evidence roles, validity tradeoffs, assumptions, limitations, and output contracts. Do not invent backend support.\n\n${proxyComposerContext(createdProxy, "target_construct")}`,
        displayText: nextObjective,
        construction_id: created.id,
        selected_field: "target_construct",
      });
    } catch (cause) {
      setError(text(cause?.message, "The proxy dataset design could not be created."));
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
      setError(text(cause?.message, "The proxy revision changed before this decision could be saved."));
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
      setError(text(cause?.message, "The governed proxy build request could not be created."));
      refreshThread().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => { setNewMode(true); setObjective(""); setSelectedArea("target_construct"); };
  const showExecution = Boolean(construction && ["execution", "registered", "query_ready", "failed"].includes(construction.mode));

  return (
    <PageShell className="rd-v2-synthesis-page rd-rc3-synthesis-page rd-loop7-synthesis-page" title="Synthesis" lead="Construct defensible proxy datasets from controlled evidence when the ideal measure does not cleanly exist.">
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
          {!newMode && !loading && !proxy ? <EmptyWorkspace onNew={startNew} /> : null}
          {!newMode && proxy && construction ? (
            <>
              <SynthesisProxyCanvas
                view={proxy}
                onSelectArea={(area) => setSelectedArea(area)}
                onAsk={ask}
                onGoTab={onGoTab}
                onOpenDataset={onOpenDataset}
              />
              {construction.mode === "proposal" ? <ProposalReview construction={construction} busy={busy} onDecide={decideProposal} onAsk={ask} /> : null}
              {showExecution ? <ExecutionRecord construction={construction} busy={busy} onRequest={requestExecution} onAsk={ask} onOpenDataset={onOpenDataset} /> : null}
            </>
          ) : null}
        </main>
      </div>
    </PageShell>
  );
}

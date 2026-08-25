from pathlib import Path

path = Path("drive/src/v2/SynthesisPage.jsx")
text = path.read_text(encoding="utf-8")
if 'data-testid="synthesis-preview-state"' in text:
    print("Preview center patch already present.")
    raise SystemExit(0)


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one patch target, found {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)


def replace_between(start: str, end: str, new: str) -> None:
    global text
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"missing start marker: {start}")
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"missing end marker: {end}")
    text = text[:i] + new.rstrip() + "\n\n" + text[j:]


replace_once(
    "  executionTrack,\n  synthesisShowsEvidenceMap,",
    "  executionTrack,\n  synthesisPreviewTruth,\n  synthesisShowsEvidenceMap,",
)
replace_once(
    'import "./s04-opening.css";',
    'import "./s04-opening.css";\nimport "./synthesis-preview.css";',
)

replace_between(
    "function stageLabel(thread) {",
    "function evidenceNodes(thread) {",
    '''function stageLabel(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const mode = stateFor(thread);
  if (isPreAcceptance(thread)) return EXPLORATION_READY;
  if (mode === "query_ready") return "Query-ready output";
  if (mode === "registered") return "Registered output";
  if (mode === "failed") return "Execution failed";
  if (mode === "execution") {
    const normalized = text(execution.status).toLowerCase().replace(/-/g, "_");
    if (state.execution_spec && (!normalized || normalized === "spec_accepted")) {
      const preview = synthesisPreviewTruth(thread);
      if (preview.failed) return "Preview failed";
      if (preview.succeeded) return "Preview passed";
      return "Preview required";
    }
    return execution.status
      ? text(execution.status).replace(/_/g, " ")
      : text(state.maturityLabel || state.maturity, "Accepted method");
  }
  if (mode === "proposal") return "Proposal needs review";
  return text(state.maturityLabel || state.maturity, mode === "draft" ? "New thread" : "Evidence mapping");
}''',
)

replace_between(
    "function threadStatus(thread) {",
    "function threadOutput(thread) {",
    '''function threadStatus(thread) {
  const state = thread?.state || {};
  const execution = state.execution || {};
  const mode = stateFor(thread);
  if (mode === "query_ready") return "Query ready";
  if (mode === "registered") return "Registered";
  if (mode === "failed") return "Needs recovery";
  const normalized = text(execution.status).toLowerCase().replace(/-/g, "_");
  if (state.execution_spec && (!normalized || normalized === "spec_accepted")) {
    const preview = synthesisPreviewTruth(thread);
    if (preview.failed) return "Preview failed";
    if (preview.succeeded) return "Preview passed";
    return "Preview required";
  }
  if (execution.status) return text(execution.status).replace(/_/g, " ");
  if (state.proposal) return "Review proposal";
  return text(state.maturityLabel || state.maturity, "Exploring");
}''',
)

replace_between(
    "function ExecutionRecord({ thread, busy, onRequest, onReview, onAsk, onOpenDataset }) {",
    "function DraftCanvas({ thread, onAsk, stalled, onRetry }) {",
    '''function ExecutionRecord({ thread, busy, onRequest, onReview, onAsk, onOpenDataset }) {
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
  const previewTruth = synthesisPreviewTruth(thread);
  const preview = previewTruth.preview || {};
  const previewEligible = Boolean(hasSpec && !registered && !failed && !pendingApproval && !active && (!rawStatus || rawStatus === "spec_accepted"));
  const previewStatus = previewTruth.failed ? "Failed" : previewTruth.succeeded ? "Passed" : previewTruth.stale ? "Stale" : "Required";
  const track = executionTrack(rawStatus, registered, queryReady, previewTruth.current ? preview : {});
  const previewRows = preview.rows || {};
  const sampling = preview.sampling || {};
  const previewOutput = preview.output || {};
  const sampleRows = Array.isArray(previewOutput.rows) ? previewOutput.rows : [];
  const sampleColumns = Array.isArray(previewOutput.columns) ? previewOutput.columns : Object.keys(sampleRows[0] || {});
  const warningCount = Array.isArray(preview.preflight?.warnings) ? preview.preflight.warnings.length : 0;
  const showExecutionProof = Boolean(execution.job_id || registered || failed || pendingApproval || active);
  const headline = previewEligible
    ? previewTruth.failed
      ? "Bounded preview failed"
      : previewTruth.succeeded
        ? "Bounded preview passed"
        : "Bounded preview required"
    : queryReady
      ? "Query-ready research asset"
      : registered
        ? "Registered research asset"
        : failed
          ? "Execution failed"
          : "Execution record";
  const badge = previewEligible ? previewStatus : queryReady ? "Query ready" : registered ? "Registered" : status;

  return (
    <section className="s04-card" data-testid={queryReady ? "synthesis-query-ready-state" : registered ? "synthesis-registered-state" : failed ? "synthesis-failed-state" : "synthesis-execution-state"}>
      <header className="s04-title">
        <div>
          <small>{headline}</small>
          <h2>{registered ? softIdentifier(outputId, "Registered output") : softIdentifier(spec.output_dataset_id, "No execution requested")}</h2>
        </div>
        <em className={registered || previewTruth.succeeded ? "success" : failed || previewTruth.failed ? "warn" : "neutral"}>{badge}</em>
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
              <b>{step.state === "done" ? "✓" : step.state === "failed" ? "×" : index + 1}</b>
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {previewEligible ? (
        <section
          className={`s04-preview-receipt ${previewTruth.failed ? "is-failed" : previewTruth.succeeded ? "is-passed" : "is-required"}`}
          data-testid="synthesis-preview-state"
        >
          <header className="s04-preview-head">
            <div>
              <small>Preview/Test</small>
              <strong>{previewTruth.succeeded ? "This accepted recipe completed on bounded bytes." : previewTruth.failed ? "The bounded recipe did not complete." : "Test this accepted recipe before full execution."}</strong>
            </div>
            <em>{previewStatus}</em>
          </header>
          {!previewTruth.current ? (
            <p className="s04-preview-copy">
              The desk will run the production transform, join, and aggregation semantics against a bounded input window. It will not create a worker job or research asset.
            </p>
          ) : null}
          {previewTruth.succeeded ? (
            <>
              <dl className="s04-preview-metrics">
                <div><dt>Source rows</dt><dd>{sampling.source_rows == null ? "—" : Number(sampling.source_rows).toLocaleString()}</dd></div>
                <div><dt>Previewed</dt><dd>{sampling.previewed_rows == null ? "—" : Number(sampling.previewed_rows).toLocaleString()}</dd></div>
                <div><dt>After transforms</dt><dd>{previewRows.after_transforms == null ? "—" : Number(previewRows.after_transforms).toLocaleString()}</dd></div>
                <div><dt>Output rows</dt><dd>{previewRows.output == null ? "—" : Number(previewRows.output).toLocaleString()}</dd></div>
              </dl>
              <p className="s04-preview-copy">
                {warningCount ? `${warningCount} preflight warning${warningCount === 1 ? "" : "s"} recorded. ` : "No preflight warnings recorded. "}
                Sampling: {text(sampling.strategy, "bounded window").replace(/_/g, " ")}.
              </p>
              {sampleRows.length && sampleColumns.length ? (
                <div className="s04-preview-sample">
                  <small>Output sample · {sampleRows.length} row{sampleRows.length === 1 ? "" : "s"}</small>
                  <div className="s04-preview-table-wrap">
                    <table className="s04-preview-table">
                      <thead><tr>{sampleColumns.slice(0, 8).map((column) => <th key={column}>{column}</th>)}</tr></thead>
                      <tbody>
                        {sampleRows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex}>{sampleColumns.slice(0, 8).map((column) => <td key={`${rowIndex}-${column}`}>{String(row?.[column] ?? "")}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {previewTruth.failed ? <p className="s04-preview-error">{text(preview.error, "The preview failed without a recorded error detail.")}</p> : null}
          <p className="s04-preview-boundary">
            Preview is bounded evidence about this exact method revision. It materialises nothing, registers nothing, and does not prove full-population results.
          </p>
        </section>
      ) : null}
      {showExecutionProof ? (
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
      ) : null}
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
                : previewEligible
                  ? previewTruth.succeeded
                    ? "The bounded preview passed. Requesting execution now creates a separate revision-bound approval job; it still does not authorize the worker."
                    : "A successful bounded preview is required before this accepted revision may request execution approval."
                  : hasSpec
                    ? "A previewed execution request remains separate from worker approval and registration."
                    : "An accepted execution specification is required before this thread can be tested or built."}
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
        {previewEligible ? (
          <button type="button" className="rd-v2-btn primary" disabled={busy} onClick={onRequest}>
            {previewTruth.succeeded ? "Request execution approval" : previewTruth.failed ? "Rerun bounded preview" : "Run bounded preview"}
          </button>
        ) : null}
        {pendingApproval ? <button type="button" className="rd-v2-btn primary" onClick={() => onReview?.(execution)}>Review approval</button> : null}
        {active ? <span className="s04-live-note">This thread refreshes automatically.</span> : null}
        <button type="button" className="rd-v2-btn" onClick={() => onAsk("Explain the exact Preview/Test or execution state and which evidence is still missing before this output can be trusted.")}>Ask about this state</button>
      </footer>
    </section>
  );
}''',
)

replace_between(
    "  const requestExecution = async () => {",
    "  const mode = stateFor(selected);",
    '''  const requestExecution = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const current = await refreshThread(selected.id).catch(() => null);
      if (current) {
        replaceThread(current);
        onSelectThread?.(current);
        const currentStatus = text(current?.state?.execution?.status).toLowerCase().replace(/-/g, "_");
        if (currentStatus && currentStatus !== "spec_accepted") return;
      }
      const result = await requestSynthesisExecution(selected.id);
      const next = result?.thread || (result?.state ? result : await refreshThread(selected.id));
      if (next) {
        replaceThread(next);
        onSelectThread?.(next);
      }
    } catch (cause) {
      setError(text(cause?.message, "The bounded preview or execution request could not be completed."));
      refreshThread().catch(() => {});
    } finally {
      setBusy(false);
    }
  };''',
)

path.write_text(text, encoding="utf-8")

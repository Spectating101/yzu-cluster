import { useEffect, useRef, useState } from "react";
import {
  SYNTHESIS_AGENT_ACTIVITY_EVENT,
  emptySynthesisAgentRun,
  loadSynthesisAgentRun,
  persistSynthesisAgentRun,
  reduceSynthesisAgentRun,
} from "@/v2/synthesisAgentRun.js";
import {
  SYNTHESIS_OBJECT_CONTEXT_EVENT,
  clearSynthesisObjectContextSelection,
  emitSynthesisObjectContext,
  enrichSynthesisObjectContext,
} from "@/v2/synthesisObjectContext.js";

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function phaseFor(selected = {}) {
  const stage = normalized(selected.synthesis_stage);
  if (["proposal", "preview", "approval"].includes(stage)) return "review";
  if (["build", "result"].includes(stage)) return "execute";
  return "design";
}

function focusCentre(selector, target = null) {
  if (typeof document === "undefined") return;
  if (selector) {
    let element = null;
    try {
      element = document.querySelector(selector);
    } catch {
      element = null;
    }
    if (element) {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      element.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      element.setAttribute("data-synthesis-agent-focus", "true");
      window.setTimeout(() => element.removeAttribute("data-synthesis-agent-focus"), 1200);
      document.dispatchEvent(new CustomEvent("synthesis:agent-focus", { detail: { selector } }));
    }
  }
  if (target) emitSynthesisObjectContext(target);
}

function useObservableAgentRun({ threadId, automationState }) {
  const [run, setRun] = useState(() => loadSynthesisAgentRun(threadId));
  const threadRef = useRef(threadId);
  const lastAutomationRef = useRef("");

  useEffect(() => {
    if (threadRef.current === threadId) return;
    threadRef.current = threadId;
    lastAutomationRef.current = "";
    setRun(loadSynthesisAgentRun(threadId));
  }, [threadId]);

  useEffect(() => {
    if (!threadId || typeof document === "undefined") return undefined;
    const onActivity = (event) => {
      const detail = event?.detail || {};
      if (String(detail.threadId || "") !== String(threadId)) return;
      setRun((current) => reduceSynthesisAgentRun(current, detail));
    };
    document.addEventListener(SYNTHESIS_AGENT_ACTIVITY_EVENT, onActivity);
    return () => document.removeEventListener(SYNTHESIS_AGENT_ACTIVITY_EVENT, onActivity);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    const automation = String(automationState || "").trim();
    if (!automation || automation === lastAutomationRef.current) {
      lastAutomationRef.current = automation;
      return;
    }
    const at = Date.now();
    setRun((current) => {
      let next = current?.threadId === threadId ? current : loadSynthesisAgentRun(threadId);
      if (!next.id || next.state === "complete" || next.state === "paused") {
        next = reduceSynthesisAgentRun(emptySynthesisAgentRun(threadId), {
          threadId,
          kind: "run_started",
          runId: `automation-${at}`,
          at,
        });
      }
      return reduceSynthesisAgentRun(next, {
        threadId,
        kind: "automation",
        text: automation,
        at,
      });
    });
    lastAutomationRef.current = automation;
  }, [threadId, automationState]);

  useEffect(() => {
    persistSynthesisAgentRun(run);
  }, [run]);

  return run;
}

function useSelectedObjectContext(selected = {}) {
  const threadId = String(selected.thread_id || "");
  const [context, setContext] = useState(null);

  useEffect(() => {
    setContext(null);
    if (!threadId || typeof document === "undefined") return undefined;
    const onContext = (event) => {
      if (event?.detail?.clear) {
        setContext(null);
        return;
      }
      const next = enrichSynthesisObjectContext(event?.detail || {}, selected);
      if (!next) return;
      if (next.thread_id && String(next.thread_id) !== threadId) return;
      setContext(next);
    };
    document.addEventListener(SYNTHESIS_OBJECT_CONTEXT_EVENT, onContext);
    return () => document.removeEventListener(SYNTHESIS_OBJECT_CONTEXT_EVENT, onContext);
  }, [threadId, selected.proposal_id, selected.proposal_hash, selected.accepted_spec_hash, selected.preview_spec_hash, selected.job_id, selected.run_id, selected.output_dataset_id, selected.registration_id]);

  return [context, setContext];
}

function decisionReceipt(selected = {}) {
  const kind = normalized(selected.decision_kind);
  const detail = String(selected.current_decision || selected.decision_next || "").trim();
  const map = {
    map_evidence: ["Review held evidence", '[data-testid="synthesis-evidence-state"]'],
    resolve_scope: ["Resolve scope", '[data-testid="synthesis-scope-block"]'],
    resolve_units: ["Resolve units", '[data-testid="synthesis-unit-conflict"]'],
    resolve_join: ["Resolve join", '[data-testid="synthesis-join-decision"]'],
    review_recommendation: ["Review construction", '[data-testid="synthesis-evidence-proposal"]'],
    design_method: ["Design method", '[data-testid="synthesis-evidence-proposal"]'],
    review_proposal: ["Review exact method revision", '[data-testid="synthesis-proposal-state"]'],
    run_preview: ["Run bounded Preview", '[data-testid="synthesis-preview-state"]'],
    recover_preview: ["Recover failed Preview", '[data-testid="synthesis-preview-state"]'],
    review_preview: ["Review Preview proof", '[data-testid="synthesis-preview-state"]'],
    approve_execution: ["Authorize bound execution", '[data-testid="synthesis-execution-state"]'],
    recover_build: ["Recover failed build", '[data-testid="synthesis-failed-state"]'],
    await_registration: ["Await archive + registry proof", '[data-testid="synthesis-execution-state"]'],
    inspect_result: ["Inspect registered result", '[data-testid="synthesis-registered-state"]'],
    inspect_registered_result: ["Inspect Library handoff", '[data-testid="synthesis-query-ready-state"]'],
  };
  const resolved = map[kind];
  if (!resolved) return null;
  return {
    id: `decision:${kind}`,
    label: resolved[0],
    detail: detail || "Current durable authority boundary.",
    tone: kind.startsWith("recover_") ? "warn" : "current",
    selector: resolved[1],
  };
}

function receiptsFor(selected = {}) {
  const receipts = [];
  if (selected.objective) {
    receipts.push({
      id: "objective",
      label: "Research intent recorded",
      detail: String(selected.objective),
      tone: "done",
      selector: ".s04-opening-brief",
    });
  }

  if (Number.isFinite(Number(selected.measured_inputs))) {
    const unmeasured = Array.isArray(selected.unmeasured_inputs) ? selected.unmeasured_inputs.length : 0;
    receipts.push({
      id: "measurement",
      label: "Evidence measured",
      detail: `${Number(selected.measured_inputs)} input${Number(selected.measured_inputs) === 1 ? "" : "s"} measured${unmeasured ? ` · ${unmeasured} unresolved` : ""}`,
      tone: unmeasured ? "warn" : "done",
      selector: '[data-testid="synthesis-evidence-state"]',
    });
  }

  const decision = decisionReceipt(selected);
  if (decision) receipts.push(decision);

  if (selected.proposal_id || selected.proposal_hash) {
    receipts.push({
      id: "proposal",
      label: "Exact proposal recorded",
      detail: selected.proposal_hash ? `Revision ${String(selected.proposal_hash).slice(0, 18)}…` : "Revision identity recorded",
      tone: normalized(selected.decision_kind) === "review_proposal" ? "current" : "done",
      selector: '[data-testid="synthesis-proposal-state"]',
    });
  }

  if (selected.accepted_spec_hash) {
    receipts.push({
      id: "accepted",
      label: "Method revision accepted",
      detail: `Spec ${String(selected.accepted_spec_hash).slice(0, 18)}…`,
      tone: "done",
      selector: '[data-testid="synthesis-preview-state"], [data-testid="synthesis-execution-state"]',
    });
  }

  if (selected.preview_status) {
    const previewStatus = normalized(selected.preview_status);
    const bound = Boolean(
      selected.accepted_spec_hash &&
      selected.preview_spec_hash &&
      selected.accepted_spec_hash === selected.preview_spec_hash,
    );
    receipts.push({
      id: "preview",
      label: `Bounded Preview ${previewStatus === "succeeded" ? "passed" : previewStatus.replace(/_/g, " ")}`,
      detail: bound
        ? `${Number.isFinite(Number(selected.preview_rows)) ? `${Number(selected.preview_rows).toLocaleString()} rows · ` : ""}bound to accepted revision`
        : "Preview receipt is not bound to the current accepted revision",
      tone: previewStatus === "succeeded" && bound ? "done" : "warn",
      selector: '[data-testid="synthesis-preview-state"], [data-testid="synthesis-execution-state"]',
    });
  }

  const execution = normalized(selected.execution_status);
  if (execution && !["unknown", "not_materialised", "spec_accepted"].includes(execution)) {
    const final = ["registered", "query_ready"].includes(execution);
    receipts.push({
      id: "execution",
      label: final ? "Execution completed" : `Execution ${execution.replace(/_/g, " ")}`,
      detail: selected.job_id ? `Bound job ${selected.job_id}` : "Durable execution record",
      tone: execution === "failed" ? "warn" : final ? "done" : "current",
      selector: execution === "failed"
        ? '[data-testid="synthesis-failed-state"]'
        : '[data-testid="synthesis-execution-state"], [data-testid="synthesis-registered-state"], [data-testid="synthesis-query-ready-state"]',
    });
  }

  if (selected.archive_verified) {
    receipts.push({
      id: "archive",
      label: "Archive proof verified",
      detail: selected.manifest_id ? `Manifest ${selected.manifest_id}` : "Archive receipt recorded",
      tone: "done",
      selector: '[data-testid="synthesis-execution-state"], [data-testid="synthesis-registered-state"]',
    });
  }

  if (selected.registry_verified || selected.output_dataset_id) {
    receipts.push({
      id: "result",
      label: selected.registry_verified ? "Registry proof verified" : "Output identity recorded",
      detail: selected.output_dataset_id || "Registered output recorded",
      tone: selected.registry_verified ? "done" : "current",
      selector: '[data-testid="synthesis-registered-state"], [data-testid="synthesis-query-ready-state"]',
    });
  }

  const deduped = [];
  const seen = new Set();
  receipts.forEach((receipt) => {
    if (!receipt || seen.has(receipt.id)) return;
    seen.add(receipt.id);
    deduped.push(receipt);
  });
  return deduped.slice(-5);
}

function timeLabel(value) {
  const timestamp = Number(value);
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(timestamp);
  } catch {
    return "";
  }
}

function targetLabel(target) {
  if (!target) return "";
  const label = String(target.label || "").trim();
  const id = String(target.object_id || "").trim();
  if (label && id) return `${label} · ${id}`;
  return label || id;
}

function RunStep({ step }) {
  const target = step.target || null;
  const inspectable = Boolean(step.selector || target);
  const metadata = [timeLabel(step.at), step.action, targetLabel(target)].filter(Boolean).join(" · ");
  return (
    <li className={`is-${step.tone}`}>
      <button
        type="button"
        disabled={!inspectable}
        onClick={() => focusCentre(step.selector || target?.selector, target)}
        title={inspectable ? "Inspect the exact research object touched by this operation" : "Observable agent operation"}
      >
        <span className="rd-v2-synthesis-agent-mark" aria-hidden="true">
          {step.tone === "done" ? "✓" : step.tone === "warn" ? "!" : "→"}
        </span>
        <span>
          <b>{step.text}</b>
          {metadata ? <small>{metadata}</small> : null}
        </span>
      </button>
    </li>
  );
}

function RunTimeline({ run }) {
  if (!run?.steps?.length && !run?.history?.length) return null;
  const stateLabel = run.state === "running" ? "LIVE" : run.state === "paused" ? "NEEDS ATTENTION" : "LAST RUN";
  const recentSteps = (run.steps || []).slice(-6);
  const history = Array.isArray(run.history) ? run.history : [];
  const currentSnapshot = run.id
    ? [{ id: run.id, state: run.state, startedAt: run.startedAt, updatedAt: run.updatedAt, steps: run.steps || [] }]
    : [];
  const allRuns = [...history, ...currentSnapshot];
  const operationCount = allRuns.reduce((count, item) => count + (item.steps?.length || 0), 0);
  const hasDeepTrace = operationCount > recentSteps.length || allRuns.length > 1;

  return (
    <div className="rd-v2-synthesis-agent-run" data-testid="synthesis-agent-run" data-run-state={run.state}>
      <div className="rd-v2-synthesis-agent-run-head">
        <small>{run.state === "running" ? "Agent run" : "Recent agent run"}</small>
        <span>{stateLabel}</span>
      </div>
      <ol>
        {recentSteps.map((step) => <RunStep key={step.id} step={step} />)}
      </ol>
      {hasDeepTrace ? (
        <details className="rd-v2-synthesis-agent-trace" data-testid="synthesis-agent-trace">
          <summary>View run trace · {operationCount} operations · {allRuns.length} run{allRuns.length === 1 ? "" : "s"}</summary>
          <div>
            {[...allRuns].reverse().map((item, runIndex) => (
              <section key={item.id || runIndex}>
                <header>
                  <b>{runIndex === 0 ? "Current / latest run" : `Earlier run ${runIndex}`}</b>
                  <span>{[timeLabel(item.startedAt), item.state].filter(Boolean).join(" · ")}</span>
                </header>
                <ol>
                  {(item.steps || []).map((step) => <RunStep key={`${item.id}-${step.id}`} step={step} />)}
                </ol>
              </section>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function printable(value) {
  if (value == null || value === "") return "Not recorded";
  if (Array.isArray(value)) return value.length ? value.map((item) => printable(item)).join(" · ") : "[]";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compactJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function diffRows(selected = {}) {
  const current = selected.forensic_current_spec || {};
  const operations = Array.isArray(selected.forensic_proposal_operations) ? selected.forensic_proposal_operations : [];
  const rows = [];
  operations.forEach((operation, index) => {
    const kind = normalized(operation?.op || operation?.type);
    if (kind === "update_spec" && operation?.patch && typeof operation.patch === "object") {
      Object.entries(operation.patch).forEach(([key, next]) => {
        const before = current?.[key];
        if (compactJson(before) === compactJson(next)) return;
        rows.push({ id: `${index}:${key}`, label: key.replace(/_/g, " "), before, after: next });
      });
      return;
    }
    rows.push({
      id: `${index}:${kind || "operation"}`,
      label: String(operation?.summary || operation?.label || kind || "structured change").replace(/_/g, " "),
      before: "—",
      after: "Proposed",
    });
  });
  return rows.slice(0, 24);
}

function transformSummary(transform = {}, index = 0) {
  const kind = String(transform.op || transform.type || `step ${index + 1}`).replace(/_/g, " ");
  const details = Object.entries(transform)
    .filter(([key]) => !["op", "type"].includes(key))
    .slice(0, 6)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${printable(value)}`);
  return { kind, details: details.join(" · ") };
}

function previewEffects(preview = {}) {
  const sampling = preview.sampling || {};
  const rows = preview.rows || {};
  const explicit = Array.isArray(preview.row_effects) ? preview.row_effects : [];
  if (explicit.length) {
    return explicit.slice(0, 30).map((effect, index) => ({
      id: String(effect.id || effect.step || effect.label || index),
      label: String(effect.label || effect.step || effect.operation || `Step ${index + 1}`),
      before: effect.before ?? effect.input_rows ?? effect.rows_before,
      after: effect.after ?? effect.output_rows ?? effect.rows_after,
      dropped: effect.dropped ?? effect.removed ?? effect.delta,
    }));
  }
  const fallback = [
    ["Source rows", sampling.source_rows],
    ["Previewed rows", sampling.previewed_rows],
    ["After transforms", rows.after_transforms],
    ["Output rows", rows.output],
  ].filter(([, value]) => value != null);
  return fallback.map(([label, value], index) => ({ id: `${index}:${label}`, label, after: value }));
}

function ForensicPanel({ selected = {} }) {
  const spec = selected.forensic_execution_spec;
  const preview = selected.forensic_preview;
  const execution = selected.forensic_execution;
  const diffs = diffRows(selected);
  const effects = previewEffects(preview || {});
  const transforms = Array.isArray(spec?.transforms) ? spec.transforms : [];
  const metrics = Array.isArray(spec?.metrics) ? spec.metrics : [];
  const groupBy = Array.isArray(spec?.group_by) ? spec.group_by : [];
  const hasData = Boolean(spec || diffs.length || effects.length || execution);
  if (!hasData) return null;

  return (
    <details className="rd-v2-synthesis-forensics" data-testid="synthesis-forensics">
      <summary>
        <span><small>Terminal-depth proof</small><b>Forensic depth</b></span>
        <em>Recipe · diff · row effects · runtime</em>
      </summary>
      <div className="rd-v2-synthesis-forensics-body">
        {diffs.length ? (
          <section data-testid="synthesis-research-diff">
            <header><small>Research diff</small><strong>Exact proposed change</strong></header>
            <dl className="rd-v2-synthesis-forensic-diff">
              {diffs.map((row) => (
                <div key={row.id}>
                  <dt>{row.label}</dt>
                  <dd><span>{printable(row.before)}</span><b>→</b><strong>{printable(row.after)}</strong></dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {spec ? (
          <section data-testid="synthesis-exact-recipe">
            <header><small>Exact recipe</small><strong>{spec.output_dataset_id || "Bound construction"}</strong></header>
            <ol className="rd-v2-synthesis-recipe">
              <li><b>Input</b><span>{printable(spec.input_dataset_id)}</span></li>
              {transforms.map((transform, index) => {
                const summary = transformSummary(transform, index);
                return <li key={`${summary.kind}-${index}`}><b>{summary.kind}</b><span>{summary.details || "No additional parameters recorded"}</span></li>;
              })}
              {groupBy.length ? <li><b>Group</b><span>{groupBy.join(" + ")}</span></li> : null}
              {metrics.map((metric, index) => (
                <li key={`metric-${index}`}><b>Metric</b><span>{printable(metric)}</span></li>
              ))}
              <li><b>Output</b><span>{printable(spec.output_dataset_id)}</span></li>
            </ol>
            <details className="rd-v2-synthesis-raw-spec">
              <summary>View exact spec JSON</summary>
              <pre>{JSON.stringify(spec, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {effects.length || preview?.warnings?.length || preview?.error ? (
          <section data-testid="synthesis-preview-forensics">
            <header><small>Preview forensics</small><strong>Observed row effects</strong></header>
            {effects.length ? (
              <table className="rd-v2-synthesis-row-effects">
                <thead><tr><th>Stage</th><th>Before</th><th>After</th><th>Δ</th></tr></thead>
                <tbody>
                  {effects.map((effect) => {
                    const before = Number(effect.before);
                    const after = Number(effect.after);
                    const explicitDelta = Number(effect.dropped);
                    const delta = Number.isFinite(explicitDelta)
                      ? explicitDelta
                      : Number.isFinite(before) && Number.isFinite(after)
                        ? after - before
                        : null;
                    return (
                      <tr key={effect.id}>
                        <th>{effect.label}</th>
                        <td>{Number.isFinite(before) ? before.toLocaleString() : "—"}</td>
                        <td>{Number.isFinite(after) ? after.toLocaleString() : effect.after != null ? printable(effect.after) : "—"}</td>
                        <td>{Number.isFinite(delta) ? `${delta > 0 ? "+" : ""}${delta.toLocaleString()}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {preview?.warnings?.length ? (
              <ul className="rd-v2-synthesis-forensic-notes">
                {preview.warnings.map((warning, index) => <li key={`warning-${index}`}>{printable(warning)}</li>)}
              </ul>
            ) : null}
            {preview?.error ? <p className="rd-v2-synthesis-forensic-error">{printable(preview.error)}</p> : null}
          </section>
        ) : null}

        {execution ? (
          <section data-testid="synthesis-execution-forensics">
            <header><small>Execution diagnostics</small><strong>{printable(execution.status)}</strong></header>
            <dl className="rd-v2-synthesis-runtime-proof">
              <div><dt>Job</dt><dd>{printable(execution.job_id)}</dd></div>
              <div><dt>Run</dt><dd>{printable(execution.run_id)}</dd></div>
              <div><dt>Worker</dt><dd>{printable(execution.worker || execution.worker_pool)}</dd></div>
              <div><dt>Attempt</dt><dd>{printable(execution.attempt)}</dd></div>
              <div><dt>Rows</dt><dd>{execution.rows == null ? "Not recorded" : Number(execution.rows).toLocaleString()}</dd></div>
              <div><dt>Manifest</dt><dd>{printable(execution.manifest_id)}</dd></div>
              <div><dt>Heartbeat</dt><dd>{printable(execution.heartbeat_at)}</dd></div>
              <div><dt>Latest event</dt><dd>{printable(execution.latest_event_at)}</dd></div>
              <div><dt>Archive</dt><dd>{execution.archive_verified ? "Verified" : "Not verified"}</dd></div>
              <div><dt>Registry</dt><dd>{execution.registry_verified ? "Verified" : "Not verified"}</dd></div>
            </dl>
            {execution.error ? <p className="rd-v2-synthesis-forensic-error">{printable(execution.error)}</p> : null}
          </section>
        ) : null}
      </div>
    </details>
  );
}

export function SynthesisAgentConsole({
  selected = {},
  busy = false,
  status = "",
  automationState = "",
  automationLabel = "Manual",
  onSend,
}) {
  if (!selected.thread_id) return null;
  const phase = phaseFor(selected);
  const receipts = receiptsFor(selected);
  const run = useObservableAgentRun({
    threadId: selected.thread_id,
    automationState,
  });
  const [objectContext, setObjectContext] = useSelectedObjectContext(selected);
  const operation = String(
    automationState ||
    (busy ? status || "Working against the current Synthesis thread…" : "") ||
    selected.current_decision ||
    selected.decision_next ||
    "Durable thread is stable. Ask can inspect or revise it.",
  ).trim();

  const clearObjectContext = () => {
    clearSynthesisObjectContextSelection();
    setObjectContext(null);
    emitSynthesisObjectContext({ clear: true, thread_id: selected.thread_id });
  };

  return (
    <section className="rd-v2-synthesis-agent-console" data-testid="synthesis-agent-console" aria-label="Synthesis agent operations">
      <header className="rd-v2-synthesis-agent-head">
        <div>
          <small>AI operations</small>
          <strong>{phase === "design" ? "Design" : phase === "review" ? "Review" : "Execute"}</strong>
        </div>
        <span className="rd-v2-synthesis-agent-mode">{automationLabel}</span>
      </header>

      <div
        className={`rd-v2-synthesis-agent-current${busy || (automationState && !automationState.startsWith("Paused")) ? " is-working" : ""}`}
        data-testid="synthesis-automation-status"
      >
        <span aria-hidden="true">{busy || (automationState && !automationState.startsWith("Paused")) ? "→" : "●"}</span>
        <p><small>Current operation</small><b>{operation}</b></p>
      </div>

      {objectContext ? (
        <div className="rd-v2-synthesis-ask-object-context" data-testid="synthesis-ask-object-context">
          <div>
            <small>Selected object</small>
            <b>{objectContext.label || objectContext.kind}</b>
            <span>{[objectContext.kind, objectContext.object_id].filter(Boolean).join(" · ")}</span>
          </div>
          <button type="button" onClick={clearObjectContext}>Clear</button>
        </div>
      ) : null}

      <RunTimeline run={run} />

      {receipts.length ? (
        <div className="rd-v2-synthesis-agent-activity" data-testid="synthesis-agent-activity">
          <small>Durable proof</small>
          <ol>
            {receipts.map((receipt) => (
              <li key={receipt.id} className={`is-${receipt.tone}`}>
                <button type="button" onClick={() => focusCentre(receipt.selector)} title="Focus this proof in the Synthesis workspace">
                  <span className="rd-v2-synthesis-agent-mark" aria-hidden="true">
                    {receipt.tone === "done" ? "✓" : receipt.tone === "warn" ? "!" : "→"}
                  </span>
                  <span>
                    <b>{receipt.label}</b>
                    <small>{receipt.detail}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ForensicPanel selected={selected} />

      <footer className="rd-v2-synthesis-agent-shortcuts" aria-label="Synthesis Ask shortcuts">
        <button type="button" onClick={() => onSend?.("Explain the current Synthesis operation and its exact research consequence.")}>Explain</button>
        <button type="button" onClick={() => onSend?.("Trace the evidence and authority behind the current Synthesis decision.")}>Trace proof</button>
        <button type="button" onClick={() => onSend?.("What changed in the durable Synthesis state most recently?")}>What changed?</button>
      </footer>
    </section>
  );
}

export default SynthesisAgentConsole;

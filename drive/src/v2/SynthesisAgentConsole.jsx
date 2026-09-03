function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function phaseFor(selected = {}) {
  const stage = normalized(selected.synthesis_stage);
  if (["proposal", "preview", "approval"].includes(stage)) return "review";
  if (["build", "result"].includes(stage)) return "execute";
  return "design";
}

function focusCentre(selector) {
  if (typeof document === "undefined" || !selector) return;
  const target = document.querySelector(selector);
  if (!target) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  target.setAttribute("data-synthesis-agent-focus", "true");
  window.setTimeout(() => target.removeAttribute("data-synthesis-agent-focus"), 1200);
  document.dispatchEvent(new CustomEvent("synthesis:agent-focus", { detail: { selector } }));
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
  if (execution && !["unknown", "spec_accepted"].includes(execution)) {
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
  return deduped.slice(-6);
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
  const operation = String(
    automationState ||
    (busy ? status || "Working against the current Synthesis thread…" : "") ||
    selected.current_decision ||
    selected.decision_next ||
    "Durable thread is stable. Ask can inspect or revise it.",
  ).trim();

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

      {receipts.length ? (
        <div className="rd-v2-synthesis-agent-activity" data-testid="synthesis-agent-activity">
          <small>Durable activity</small>
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

      <footer className="rd-v2-synthesis-agent-shortcuts" aria-label="Synthesis Ask shortcuts">
        <button type="button" onClick={() => onSend?.("Explain the current Synthesis operation and its exact research consequence.")}>Explain</button>
        <button type="button" onClick={() => onSend?.("Trace the evidence and authority behind the current Synthesis decision.")}>Trace proof</button>
        <button type="button" onClick={() => onSend?.("What changed in the durable Synthesis state most recently?")}>What changed?</button>
      </footer>
    </section>
  );
}

export default SynthesisAgentConsole;

import { displayName, isQueryReadyReadiness } from "@/v2/datasetMeta";
import { candidateKey } from "@/v2/candidateKey";
import { assetAuthorityContext } from "@/v2/assetAuthority";
import { connectorContext } from "@/v2/connectorContract";
import { normalizeSynthesisExecution } from "@/v2/executionLifecycle";
import { synthesisAssist } from "@/v2/synthesisAssist.js";

function readinessLabel(dataset) {
  const raw = String(dataset?.analysis_readiness || "").trim();
  if (!raw) return "";
  // Exact tokens only — `/ready|query/` falsely labels not_ready / metadata_search.
  if (isQueryReadyReadiness(raw)) return "Query-ready";
  return raw.replace(/_/g, " ");
}

function vaultPath(dataset) {
  return dataset?.vault_path || dataset?.gdrive_path || dataset?.local_root || "";
}

function lifecycleSelection(lifecycle = {}) {
  const proof = lifecycle.proof || {};
  const routing = lifecycle.routing || {};
  return {
    execution_status: lifecycle.stage || undefined,
    progress: lifecycle.progress ?? undefined,
    run_id: proof.run_id || undefined,
    worker: proof.worker || undefined,
    worker_pool: proof.pool || undefined,
    attempt: proof.attempt ?? undefined,
    heartbeat_at: proof.heartbeat_at || undefined,
    latest_event_at: proof.latest_event_at || undefined,
    manifest_id: proof.manifest_id || undefined,
    registration_id: proof.registration_id || undefined,
    archive_verified: proof.archive_verified || undefined,
    registry_verified: proof.registry_verified || undefined,
    rows: proof.rows ?? undefined,
    fields: proof.fields ?? undefined,
    entities: proof.entities ?? undefined,
    inputs: proof.inputs?.length ? proof.inputs : undefined,
    outputs: proof.outputs?.length ? proof.outputs : undefined,
    error: lifecycle.error || undefined,
    retryable: lifecycle.retryable || undefined,
    routing_status: routing.status || undefined,
    required_capabilities: routing.required?.length ? routing.required : undefined,
    missing_capabilities: routing.missing?.length ? routing.missing : undefined,
    eligible_workers: routing.eligible_workers?.length ? routing.eligible_workers : undefined,
  };
}

function forensicSynthesisSelection(state = {}, lifecycle = {}) {
  const proposal = state.proposal || {};
  const preview = state.preview || {};
  const execution = state.execution || {};
  const exactSpec = state.execution_spec || proposal.execution_spec || null;
  const currentSpec = state.spec && typeof state.spec === "object" ? state.spec : null;
  const operations = Array.isArray(proposal.operations) ? proposal.operations.slice(0, 40) : [];
  const previewWarnings = Array.isArray(preview?.preflight?.warnings)
    ? preview.preflight.warnings.slice(0, 20)
    : [];
  const rowEffects = Array.isArray(preview?.row_effects)
    ? preview.row_effects.slice(0, 40)
    : Array.isArray(preview?.diagnostics?.row_effects)
      ? preview.diagnostics.row_effects.slice(0, 40)
      : [];
  const outputColumns = Array.isArray(preview?.output?.columns)
    ? preview.output.columns.slice(0, 40)
    : [];
  const hasPreviewForensics = Boolean(
    Object.keys(preview?.sampling || {}).length ||
    Object.keys(preview?.rows || {}).length ||
    rowEffects.length ||
    previewWarnings.length ||
    preview.error ||
    outputColumns.length
  );
  const lifecycleProof = lifecycle.proof || {};
  const hasExecutionForensics = Boolean(
    execution.status || execution.job_id || execution.manifest_id || execution.error ||
    lifecycleProof.run_id || lifecycleProof.worker || lifecycleProof.heartbeat_at || lifecycleProof.latest_event_at
  );

  return {
    forensic_current_spec: currentSpec || undefined,
    forensic_execution_spec: exactSpec || undefined,
    forensic_proposal_operations: operations.length ? operations : undefined,
    forensic_preview: hasPreviewForensics
      ? {
          sampling: preview.sampling || undefined,
          rows: preview.rows || undefined,
          row_effects: rowEffects.length ? rowEffects : undefined,
          warnings: previewWarnings.length ? previewWarnings : undefined,
          error: preview.error || undefined,
          output_columns: outputColumns.length ? outputColumns : undefined,
        }
      : undefined,
    forensic_execution: hasExecutionForensics
      ? {
          status: execution.status || lifecycle.stage || undefined,
          job_id: execution.job_id || undefined,
          run_id: lifecycleProof.run_id || undefined,
          worker: lifecycleProof.worker || undefined,
          worker_pool: lifecycleProof.pool || undefined,
          attempt: lifecycleProof.attempt ?? undefined,
          heartbeat_at: lifecycleProof.heartbeat_at || undefined,
          latest_event_at: lifecycleProof.latest_event_at || undefined,
          rows: execution.rows ?? lifecycleProof.rows ?? undefined,
          manifest_id: execution.manifest_id || lifecycleProof.manifest_id || undefined,
          registration_id: lifecycleProof.registration_id || undefined,
          archive_verified: lifecycleProof.archive_verified || execution.drive_verified || undefined,
          registry_verified: lifecycleProof.registry_verified || undefined,
          output_dataset_id: execution.output_dataset_id || exactSpec?.output_dataset_id || undefined,
          error: execution.error || lifecycle.error || undefined,
        }
      : undefined,
  };
}

export function buildRailContext({
  tab = "home",
  mode = "detail",
  dataset = null,
  activeObject = null,
  searchQuery = "",
  folderId = "",
  profileEmail = "",
} = {}) {
  let entity = null;
  let datasetId = "";
  let actions = [];
  let selected = null;

  if (activeObject?.kind === "external_candidate") {
    const row = activeObject.row || {};
    const contract = connectorContext(row);
    const key = row.candidate_key || candidateKey(row) || activeObject.id || "";
    entity = {
      kind: "external_candidate",
      id: activeObject.id,
      title: activeObject.title,
      source_id: contract.source_id,
      connector_id: contract.connector_id,
      candidate_key: key || undefined,
      status: contract.access_state || undefined,
    };
    selected = {
      title: activeObject.title,
      candidate_key: key || undefined,
      ...contract,
    };
    datasetId = row.dataset_id || row.doi || "";
    actions = ["ask_about"];
    if (contract.supported) actions.push("probe");
    if (contract.access_state === "available") actions.unshift("add_to_lab");
    if (contract.refresh_policy) actions.push("schedule_refresh");
    if (contract.credential_required) actions.push("configure_access");
    if (contract.access_state === "rate_limited" && contract.retryable) actions.push("retry_later");
    if (!contract.supported) actions.push("find_alternative_source");
  } else if (activeObject?.kind === "discover_history") {
    const row = activeObject.row || {};
    const meta = row.meta || {};
    const status = row.status || meta.status || "";
    const sourceId = meta.source_id || row.source_id || "";
    const candidateKey = meta.candidate_key || row.candidate_key || "";
    const eventId = row.id || meta.intent_id || meta.job_id || meta.subscription_id || activeObject.id || "";
    entity = {
      kind: "discover_history",
      id: eventId,
      title: activeObject.title,
      status: status || undefined,
      event_kind: row.kind || row.action || undefined,
    };
    selected = {
      title: activeObject.title,
      status: status || undefined,
      event_kind: row.kind || row.action || undefined,
      source_id: sourceId || undefined,
      candidate_key: candidateKey || undefined,
      job_id: meta.job_id || row.job_id || undefined,
      intent_id: meta.intent_id || undefined,
      summary: meta.summary || row.summary || undefined,
    };
    actions = ["explain", "ask_about"];
    if (/pending_approval|ready_for_review|awaiting|needs_approval/i.test(String(status))) {
      actions.push("review_request");
    }
  } else if (activeObject?.kind === "resource_row") {
    const row = activeObject.row || {};
    const lifecycle = row.lifecycle || {};
    const sourceContract = row.kind === "source" ? connectorContext(row) : null;
    entity = {
      kind: "resource_row",
      id: activeObject.id,
      title: activeObject.title,
      status: lifecycle.stage || sourceContract?.access_state || row.metric || undefined,
    };
    selected = {
      title: activeObject.title,
      resource_kind: row.kind || undefined,
      status: lifecycle.stage || sourceContract?.access_state || row.metric || undefined,
      detail: row.detail || lifecycle.detail || undefined,
      ...(sourceContract || {}),
      ...lifecycleSelection(lifecycle),
    };
    actions = ["explain"];
    if (lifecycle.stage === "pending_approval" || row.job?.status === "pending_approval") {
      actions.push("approve_job");
    }
    if (lifecycle.retryable && /failed|blocked/.test(String(lifecycle.stage || ""))) {
      actions.push("retry_job");
    }
    if (sourceContract?.credential_required) actions.push("configure_access");
    if (sourceContract?.probe_required) actions.push("probe");
  } else if (activeObject?.kind === "library_folder" || activeObject?.kind === "library_intake") {
    entity = { kind: activeObject.kind, id: activeObject.id, title: activeObject.title };
    actions = ["upload", "add_url", "procure"];
  } else if (activeObject?.kind === "home_attention") {
    entity = { kind: "home_attention", id: activeObject.id, title: activeObject.title };
    actions = ["open", "ask_about"];
  } else if (activeObject?.kind === "synthesis_thread") {
    const thread = activeObject.thread || {};
    const state = thread.state || {};
    const lifecycle = normalizeSynthesisExecution(thread);
    const assist = synthesisAssist(thread);
    const preview = state.preview || {};
    const outputId = lifecycle.proof?.outputs?.[0] || state.execution?.output_dataset_id || state.execution_spec?.output_dataset_id;
    const previewRows = Number(preview?.sampling?.previewed_rows);
    const unmeasured = Array.isArray(state.unmeasured) ? state.unmeasured : [];
    entity = {
      kind: "synthesis_thread",
      id: activeObject.id,
      title: activeObject.title,
      status: assist.status || (lifecycle.stage !== "unknown" ? lifecycle.stage : state.maturity || undefined),
      synthesis_stage: assist.stage,
      decision_kind: assist.decisionKind,
    };
    selected = {
      thread_id: activeObject.id,
      title: activeObject.title,
      objective: thread.objective || state.objective || undefined,
      required_grain: state.required_grain || state.spec?.grain || undefined,
      maturity: state.maturity || state.maturityLabel || undefined,
      synthesis_stage: assist.stage,
      synthesis_stage_label: assist.label,
      decision_kind: assist.decisionKind,
      current_decision: assist.decision,
      decision_risk: assist.risk,
      decision_next: assist.next,
      synthesis_ask_prompts: assist.prompts,
      active_blocker: ["resolve_scope", "resolve_units", "resolve_join"].includes(assist.decisionKind)
        ? assist.decisionKind
        : undefined,
      measured_inputs: Number.isFinite(Number(state.measured_inputs)) ? Number(state.measured_inputs) : undefined,
      unmeasured_inputs: unmeasured.length ? unmeasured : undefined,
      proposal_id: state.proposal?.id || undefined,
      proposal_hash: state.proposal?.proposal_hash || undefined,
      accepted_spec_hash: state.accepted_spec_hash || undefined,
      preview_status: preview.status || undefined,
      preview_spec_hash: preview.spec_hash || undefined,
      preview_authority_hash: preview.authority_hash || undefined,
      preview_created_at: preview.created_at || undefined,
      preview_rows: Number.isFinite(previewRows) ? previewRows : undefined,
      preview_bounded: preview.bounded === true ? true : undefined,
      output_dataset_id: outputId || undefined,
      job_id: state.execution?.job_id || undefined,
      ...lifecycleSelection(lifecycle),
      ...forensicSynthesisSelection(state, lifecycle),
    };
    actions = ["ask_about"];
    if (["design_method", "review_recommendation"].includes(assist.decisionKind)) actions.push("challenge_method");
    if (assist.decisionKind === "review_proposal") actions.push("review_proposal");
    if (["run_preview", "recover_preview"].includes(assist.decisionKind)) actions.push("run_preview");
    if (assist.decisionKind === "review_preview") actions.push("request_execution_approval");
    if (assist.decisionKind === "approve_execution") actions.push("review_execution");
    if (lifecycle.retryable && /failed|blocked/.test(lifecycle.stage)) actions.push("retry_execution");
    if (assist.stage === "result") actions.push("open_output");
    if (lifecycle.stage === "registered") actions.push("refresh_output");
  } else if (dataset?.dataset_id) {
    const authority = assetAuthorityContext(dataset);
    entity = {
      kind: "dataset",
      id: dataset.dataset_id,
      title: displayName(dataset),
      status: authority.readiness || undefined,
    };
    selected = {
      title: displayName(dataset),
      ...authority,
    };
    datasetId = dataset.dataset_id;
    actions = ["ask_about", "inspect_lineage"];
    if (authority.readiness === "query_ready") actions.unshift("preview_rows");
    if (authority.refresh_policy) actions.push("refresh_asset");
  }

  return {
    tab,
    mode,
    entity,
    selected: selected || undefined,
    dataset_id: datasetId || undefined,
    folder_id: folderId || undefined,
    search_query: searchQuery?.trim() || undefined,
    profile_email: profileEmail || undefined,
    readiness: dataset ? readinessLabel(dataset) : undefined,
    vault_path: dataset ? vaultPath(dataset) : undefined,
    actions: actions.length ? actions : undefined,
  };
}

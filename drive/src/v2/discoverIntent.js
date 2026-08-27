import { candidateKey, discoverCandidateUrl } from "./candidateKey.js";

function text(value) {
  return String(value || "").trim();
}

function listText(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" · ");
  return text(value);
}

export function discoverIntentCandidate(row = {}, probe = null) {
  const connector = probe?.connector || row?.probe_snapshot?.connector || row?.connector || {};
  return {
    candidate_key: candidateKey(row),
    dataset_id: text(row.dataset_id),
    source_id: text(row.source_id),
    connector_id: text(
      connector.connector_id ||
      connector.id ||
      row.connector_id ||
      row.collect_via,
    ),
    title: text(row.title || row.name || row.dataset_id) || "Untitled offering",
    description: text(row.description || row.one_line || row.subtitle),
    recommended_use: text(row.recommended_use),
    coverage: listText(row.coverage || row.coverage_summary),
    grain: text(row.grain || row.unit_of_observation),
    access: text(row.access_mode || row.source_access_mode || row.access_state),
    limitations: text(row.limitations),
    url: discoverCandidateUrl(row),
  };
}

function routeId(candidate) {
  const connector = text(candidate.connector_id).replace(/[^a-z0-9_-]+/gi, "_");
  return connector ? `connector_${connector}`.slice(0, 120) : "candidate_route";
}

/** A deterministic proposal from declared candidate/probe facts — never a fit score. */
export function proposalFromDiscoverCandidate(candidate = {}) {
  if (!text(candidate.connector_id)) return null;
  const route = {
    id: routeId(candidate),
    title: `Collect through ${candidate.connector_id}`,
    connector_id: candidate.connector_id,
    candidate_key: candidate.candidate_key,
    summary: candidate.description || `Connector route for ${candidate.title}.`,
    coverage: candidate.coverage,
    grain: candidate.grain,
    access: candidate.access || "Connector route declared; collection remains approval-gated.",
    limitation: candidate.limitations || "Coverage and deliverability require researcher review.",
    url: candidate.url,
    pipeline: "connector",
  };
  const cleanRoute = Object.fromEntries(
    Object.entries(route).filter(([, value]) => value !== "" && value != null),
  );
  return {
    id: `proposal_${route.id}`.slice(0, 120),
    summary: `Review the declared connector route for ${candidate.title}.`,
    reason: "Candidate identity and connector route are recorded; unknowns remain explicit.",
    routes: [cleanRoute],
    recommended_route_id: cleanRoute.id,
  };
}

function primitiveLabel(value) {
  const key = text(value);
  if (key === "http_manifest") return "HTTP acquisition";
  if (key === "scraper_run") return "Browser acquisition";
  if (key === "source_probe") return "Source probe";
  return key.replaceAll("_", " ");
}

/**
 * Normalize the backend procurement compiler summary for a compact researcher-facing surface.
 * No summary is synthesized when the backend did not compile a route.
 */
export function procurementEngineeringSummary(route = {}) {
  const execution = route?.collect_plan?.cluster_execution;
  const summary = execution?.engineering_summary;
  if (!summary || summary.status !== "compiled") return null;

  const capabilities = Array.isArray(summary.required_capabilities)
    ? summary.required_capabilities.map(text).filter(Boolean)
    : [];
  const preflight = text(summary.preflight, "ready");
  const resourceBasis = text(summary.resource_basis, "baseline_only");
  const parallelism = Number(summary.parallelism_hint);

  return {
    status: "compiled",
    primitive: text(summary.primitive),
    primitiveLabel: primitiveLabel(summary.primitive) || "Acquisition plan",
    capabilities,
    capabilityLabel: capabilities.length ? capabilities.join(" + ") : "capability not recorded",
    placementLabel: summary.placement === "runtime" ? "runtime placement" : text(summary.placement, "placement unrecorded"),
    sizingLabel: resourceBasis === "bounded" ? "bounded sizing" : "baseline sizing",
    preflight,
    preflightLabel:
      preflight === "required"
        ? "preflight required"
        : preflight === "recommended"
          ? "preflight recommended"
          : "preflight ready",
    parallelismLabel: Number.isFinite(parallelism) && parallelism > 1 ? `up to ${parallelism} parallel claims` : "single claim",
    postAcquisitionReassessment: Boolean(summary.post_acquisition_reassessment),
    contractHash: text(execution.contract_hash),
  };
}

export function intentState(intent) {
  return intent?.state && typeof intent.state === "object" ? intent.state : {};
}

export function intentCollection(intent) {
  return intentState(intent).collection || {};
}

export function selectedIntentRoute(intent) {
  const state = intentState(intent);
  return (state.routes || []).find((route) => route.id === state.selected_route_id) || null;
}

export function canSubmitDiscoverIntent(intent) {
  const state = intentState(intent);
  return Boolean(
    state.status === "ready_for_review"
      && state.selected_route_id
      && !state.collection?.job_id,
  );
}

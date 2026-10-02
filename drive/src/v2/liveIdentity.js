/** Apply RC2-A sanitized live identity onto desk rows without inventing readiness. */

const READINESS_LABELS = {
  query_ready: "Ready to query",
  registered: "Saved to Library",
  registered_not_queryable: "In Library · not yet checked",
  query_ready_declared: "Documented as ready to query · not yet checked",
  metadata_only: "Metadata only",
  metadata_search: "Metadata only",
  receipt_only: "Saved receipt · data not yet checked",
  not_ready: "Not ready",
  needs_review: "Needs review",
  unconfirmed: "Not yet checked",
  reconciliation_pending: "Being checked",
  unknown: "Readiness not described",
  registered_output: "Output saved to Library",
  registered_result: "Result saved to Library",
  query_ready_output: "Output ready to query",
  query_ready_result: "Result ready to query",
  "registered_·_unconfirmed": "In Library · not yet checked",
  "registered_·_reconciliation_pending": "In Library · being checked",
};

export function liveIdentityReadinessLabel(identity = {}) {
  const value = String(identity?.synthesis_expectation?.badge || identity?.readiness || "").trim();
  const key = value.toLowerCase().replace(/[\s-]+/g, "_");
  return READINESS_LABELS[key] || (value && /\s/.test(value) ? value : "Readiness not described");
}

export function liveIdentityBadge(identity) {
  const readiness = String(identity?.readiness || "").toLowerCase();
  if (readiness === "query_ready") return { kind: "query-ready", label: "Ready to query" };
  if (readiness === "registered") return { kind: "registered", label: "Saved to Library" };
  const expected = identity?.synthesis_expectation?.badge;
  if (expected) return { kind: readiness || "unknown", label: String(expected) };
  return null;
}

/**
 * Overlay authoritative production identity onto a catalog / detail row.
 * Does not invent query_ready when the factory only proved registration.
 */
export function applyLiveIdentity(dataset, identity) {
  if (!dataset || !identity) return dataset;
  const readiness = String(identity.readiness || "").trim();
  const badge = liveIdentityBadge(identity);
  return {
    ...dataset,
    dataset_id: identity.dataset_id || dataset.dataset_id,
    registry_id: identity.registry_id || dataset.registry_id,
    manifest_id: identity.manifest_id || dataset.manifest_id,
    job_id: identity.job_id || dataset.job_id || dataset.originating_job_id,
    run_id: identity.run_id || dataset.run_id,
    attempt: identity.attempt ?? dataset.attempt,
    worker_id: identity.worker_id || dataset.worker_id,
    analysis_readiness: readiness || dataset.analysis_readiness,
    live_identity: identity,
    live_identity_badge: badge,
    vault_path: identity.vault_suffix
      ? dataset.vault_path || dataset.local_root || identity.vault_suffix
      : dataset.vault_path || dataset.local_root,
  };
}

export function identityLookupFromRow(row = {}) {
  const datasetId = String(
    row.dataset_id || row.registry_id || row.meta?.dataset_id || row.event?.meta?.dataset_id || "",
  ).trim();
  const jobId = String(
    row.job_id || row.originating_job_id || row.meta?.job_id || row.event?.meta?.job_id || row.job?.id || "",
  ).trim();
  return {
    datasetId: datasetId || undefined,
    jobId: jobId || undefined,
  };
}

import { libraryHoldings } from "./libraryHoldings.js";

function clean(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function lineageIds(dataset = {}) {
  const lineage = dataset?.lineage || {};
  const candidates = [
    dataset?.upstream_dataset_ids,
    dataset?.derived_from,
    dataset?.source_dataset_ids,
    lineage?.upstream_dataset_ids,
    lineage?.upstream,
    lineage?.parents,
    lineage?.derived_from,
  ];
  const out = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string" || typeof item === "number") out.push(item);
        else out.push(item?.dataset_id || item?.logical_asset_id || item?.id);
      }
    } else if (candidate && typeof candidate === "string") {
      out.push(...candidate.split(/[;,]/));
    }
  }
  return unique(out);
}

export function libraryEvidenceGraph(dataset = {}) {
  const logicalAssetId = clean(dataset.logical_asset_id || dataset.dataset_id || dataset.registry_id || dataset.doi || dataset.url);
  const contentHash = clean(dataset.content_sha256 || dataset.sha256 || dataset.content_hash);
  const versionId = clean(dataset.version_id || dataset.snapshot_id || dataset.version || contentHash || "current");
  const holdings = libraryHoldings(dataset);
  const upstream = lineageIds(dataset);
  return {
    logicalAssetId,
    version: {
      id: versionId,
      label: clean(dataset.version_label || dataset.version || dataset.edition || "Current registered version"),
      contentHash,
      dataAsOf: clean(dataset.data_as_of || dataset.as_of),
    },
    holdings,
    lineage: {
      upstream,
      relation: upstream.length ? clean(dataset.lineage?.relation || dataset.lineage_relation || "derived_from") : "",
    },
    access: {
      metadataVisible: dataset.metadata_visible !== false,
      contentAccess: clean(dataset.content_access || dataset.access_state || dataset.access_mode || "unknown"),
    },
  };
}

export function libraryUsageEvent({
  dataset = {},
  action,
  projectId = "",
  relatedAssetIds = [],
  outputId = "",
  at = "",
  context = {},
} = {}) {
  const graph = libraryEvidenceGraph(dataset);
  const occurredAt = clean(at) || new Date().toISOString();
  const actionName = clean(action);
  if (!graph.logicalAssetId) throw new Error("Library usage event requires a logical asset id");
  if (!actionName) throw new Error("Library usage event requires an action");
  return {
    event_type: "library_evidence_usage",
    logical_asset_id: graph.logicalAssetId,
    version_id: graph.version.id,
    action: actionName,
    project_id: clean(projectId),
    related_asset_ids: unique(relatedAssetIds),
    output_id: clean(outputId),
    occurred_at: occurredAt,
    context: context && typeof context === "object" ? { ...context } : {},
  };
}

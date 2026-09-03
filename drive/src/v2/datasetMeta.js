/** Map registry rows → frozen UI labels (Detail + StatusPill). */

/** Exact readiness tokens that mean smoke-proven / instant local query — never fuzzy `/query|ready/`. */
export function isQueryReadyReadiness(value) {
  const readiness = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    readiness === "query_ready" ||
    readiness === "instant" ||
    readiness === "instant_or_minutes" ||
    readiness === "queryable"
  );
}

/**
 * Receipt-recovery catalog rows — registered in a receipt only, not a reusable query holding.
 * Terra donor (6769b75 / datasetMeta honesty).
 */
export function isReceiptOnlyAsset(dataset) {
  const state = String(dataset?.catalog_reconciliation?.state || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return state === "receipt_only";
}

const RUNTIME_DEMOTION = {
  local_panel_missing: "Declared queryable; local panel is missing.",
  local_bytes_missing: "Declared queryable; local bytes are missing.",
  csv_schema_mismatch: "Declared queryable; schema does not match the registered panel.",
};

export function runtimeReadinessReason(dataset) {
  return String(dataset?.runtime_readiness_reason || "").trim();
}

export function demotionSentence(dataset) {
  const reason = runtimeReadinessReason(dataset);
  if (!reason) return "";
  return RUNTIME_DEMOTION[reason] || "Declared queryable; runtime readiness is not confirmed.";
}

/** Engine already computed this. UI must not drop it. */
export function hydrateRemedy(dataset) {
  if (dataset?.hydrate_required !== true) return "";
  return "A vault archive is available to restore local bytes.";
}

function acquisitionOnlyRow(dataset = {}) {
  if (!dataset) return false;
  if (dataset.external === true) return true;
  if (!dataset.collect_via) return false;
  return !(
    dataset.registered === true ||
    dataset.registry_id ||
    dataset.local_root ||
    dataset.local_path ||
    dataset.vault_path ||
    dataset.canonical_remote
  );
}

export function statusPillKind(dataset) {
  const reason = runtimeReadinessReason(dataset);
  if (reason) {
    return { kind: "warn", label: "Not query-ready" };
  }
  if (dataset?.live_identity_badge?.kind && dataset?.live_identity_badge?.label) {
    return dataset.live_identity_badge;
  }
  if (isReceiptOnlyAsset(dataset)) {
    return { kind: "registered", label: "Registered · reconciliation pending" };
  }
  const readiness = String(dataset?.analysis_readiness || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (acquisitionOnlyRow(dataset)) {
    return { kind: "external", label: "External" };
  }
  if (isQueryReadyReadiness(readiness)) {
    return { kind: "query-ready", label: "Query ready" };
  }
  if (readiness === "registered") {
    return { kind: "registered", label: "Registered" };
  }
  if (readiness === "dry_run_before_execution" || /bigquery/i.test(dataset?.backend || "")) {
    return { kind: "connected", label: "Connected" };
  }
  if (readiness === "connected") return { kind: "connected", label: "Connected" };
  if (readiness === "metadata_search" || readiness === "metadata_only") {
    return { kind: "remote", label: "Metadata only" };
  }
  if (readiness === "procurement_planning") return { kind: "queued", label: "Queued" };
  if (readiness === "sample_now_full_later") return { kind: "warn", label: "Review" };
  if (readiness === "failed") return { kind: "failed", label: "Failed" };
  return { kind: "unknown", label: "Readiness unknown" };
}

export function statusPill(dataset) {
  return statusPillKind(dataset).label;
}

/** Faculty-facing "Can I use this?" copy — keeps Registered distinct from Query ready. */
export function canIUseDecision(dataset) {
  const demotion = demotionSentence(dataset);
  if (demotion) {
    const remedy = hydrateRemedy(dataset);
    return {
      headline: "Not query-ready",
      body: remedy ? `${demotion} ${remedy}` : demotion,
    };
  }
  const state = statusPillKind(dataset);
  const assetKind = libraryAssetKind(dataset);
  if (state.kind === "query-ready") {
    return {
      headline: "Query ready",
      body: "You can preview and query this dataset now.",
    };
  }
  if (state.kind === "connected") {
    return {
      headline: "Connected",
      body: "A live source connection exists. Instant local query access is not confirmed.",
    };
  }
  if (state.kind === "remote") {
    return {
      headline: "Metadata only",
      body: "This record supports discovery and acquisition. A queryable local asset is not confirmed.",
    };
  }
  if (state.kind === "queued") {
    return {
      headline: "Queued",
      body: "Acquisition or registration work is still pending.",
    };
  }
  if (state.kind === "warn") {
    return {
      headline: "Review required",
      body: "The current asset needs review before analysis.",
    };
  }
  if (state.kind === "failed") {
    return {
      headline: "Failed",
      body: "The current asset path failed and needs attention before use.",
    };
  }
  if (state.kind === "external") {
    return {
      headline: "External source",
      body: "This source is not confirmed as a usable Library asset.",
    };
  }
  if (state.kind === "registered" && assetKind === "scholarly_work") {
    return {
      headline: "Registered",
      body: "Retained as a reusable scholarly work in this Library. Source verification remains a separate claim.",
    };
  }
  if (state.kind === "registered" && assetKind === "operational") {
    return {
      headline: "Registered",
      body: "Retained as a reusable operational record; its current state must be judged from the recorded evidence.",
    };
  }
  if (state.kind === "registered") {
    return {
      headline: "Registered",
      body: "Registered and reusable as an archived research asset; querying has not yet been proven.",
    };
  }
  return {
    headline: "Readiness unknown",
    body: "Current metadata does not establish a usable query path.",
  };
}

function normalizedAssetType(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function textCorpus(dataset = {}) {
  return [
    dataset?.name,
    dataset?.title,
    dataset?.display_name,
    dataset?.one_line,
    dataset?.description,
    dataset?.recommended_use,
    ...(Array.isArray(dataset?.tags) ? dataset.tags : []),
    ...(Array.isArray(dataset?.keywords) ? dataset.keywords : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Library holds more than rectangular datasets. Prefer explicit backend type
 * metadata when available, then use conservative structural evidence. This is
 * presentation typing only; it never upgrades readiness or invents access.
 */
export function libraryAssetKind(dataset = {}) {
  const explicit = normalizedAssetType(
    dataset?.research_asset_kind || dataset?.asset_kind || dataset?.asset_type || dataset?.record_type,
  );
  if (["scholarly_work", "paper", "article", "publication", "literature"].includes(explicit)) {
    return "scholarly_work";
  }
  if (["metadata_index", "catalog", "catalogue", "dataset_catalog"].includes(explicit)) {
    return "metadata_index";
  }
  if (["operational", "status", "status_endpoint", "manifest"].includes(explicit)) {
    return "operational";
  }
  if (["live_source", "api", "remote_queryable"].includes(explicit)) {
    return "live_source";
  }
  if (["dataset", "table", "panel", "tabular"].includes(explicit)) return "dataset";

  const accessShape = normalizedAssetType(dataset?.access_shape);
  const backend = normalizedAssetType(dataset?.backend);
  const grain = normalizedAssetType(dataset?.grain);
  const corpus = textCorpus(dataset);
  const hasBibliographicIdentity = Boolean(dataset?.doi || /\bdoi\b/.test(corpus));
  const scholarlyLanguage = /\b(paper|article|scholarly|publication|literature|citation)\b/.test(corpus);

  if (
    scholarlyLanguage &&
    (hasBibliographicIdentity || accessShape === "local_file" || grain === "procured_snapshot")
  ) {
    return "scholarly_work";
  }
  // A registered remote holding with an explicit live connection is a source
  // contract, not a rectangular dataset. This is presentation typing only:
  // Connected remains distinct from Query ready and no access is promoted.
  if (
    statusPillKind(dataset).kind === "connected" &&
    !dataset?.local_root &&
    !dataset?.local_path &&
    !dataset?.vault_path
  ) {
    return "live_source";
  }
  if (accessShape === "metadata_index" || /catalog|catalogue/.test(backend)) return "metadata_index";
  if (/status|manifest|operational/.test(`${accessShape} ${backend}`)) return "operational";
  if (/api/.test(backend) && !dataset?.local_root && !dataset?.local_path) return "live_source";
  return "dataset";
}

export function libraryAssetPresentation(dataset = {}) {
  const kind = libraryAssetKind(dataset);
  if (kind === "scholarly_work") {
    return {
      kind,
      noun: "scholarly work",
      eyebrow: "Selected scholarly work",
      shapeTitle: "Bibliographic record",
      structureTitle: "Record details",
      structureAction: "Inspect record",
      askLabel: "Ask about this work",
      previewRows: false,
    };
  }
  if (kind === "metadata_index") {
    return {
      kind,
      noun: "metadata index",
      eyebrow: "Selected metadata index",
      shapeTitle: "Index scope",
      structureTitle: "Record structure",
      structureAction: "Inspect fields",
      askLabel: "Ask about this index",
      previewRows: true,
    };
  }
  if (kind === "live_source") {
    return {
      kind,
      noun: "live source",
      eyebrow: "Selected live source",
      shapeTitle: "Source contract",
      structureTitle: "Declared response shape",
      structureAction: "Inspect fields",
      askLabel: "Ask about this source",
      previewRows: true,
    };
  }
  if (kind === "operational") {
    return {
      kind,
      noun: "operational resource",
      eyebrow: "Selected operational resource",
      shapeTitle: "Operational record",
      structureTitle: "Recorded state",
      structureAction: "Inspect record",
      askLabel: "Ask about this resource",
      previewRows: false,
    };
  }
  return {
    kind: "dataset",
    noun: "dataset",
    eyebrow: "Selected Library asset",
    shapeTitle: "Declared evidence shape",
    structureTitle: "Declared structure",
    structureAction: "Inspect fields",
    askLabel: "Ask about access",
    previewRows: true,
  };
}

export function displayName(dataset) {
  return dataset?.name || dataset?.title || dataset?.dataset_id || "Dataset";
}

export function rowSubtitle(dataset) {
  const parts = [dataset?.subtitle || dataset?.dataset_id || dataset?.doi || dataset?.url, dataset?.grain].filter(Boolean);
  const cov = dataset?.coverage || dataset?.date_range;
  if (cov) parts.push(String(cov));
  return parts.join(" · ");
}

export function detailFields(dataset) {
  const d = dataset || {};
  const partitionParts = [d.grain, d.coverage || d.date_range || d.temporal_coverage].filter(Boolean);
  const joinKeys = d.join_keys || [];
  return {
    description: d.description || d.recommended_use || "",
    coverage: d.coverage || d.date_range || d.temporal_coverage || null,
    // Source authority must remain distinct from transport/backend metadata.
    source: d.source || d.publisher || d.source_system || null,
    access:
      d.access_mode ||
      d.access_shape ||
      (d.local_root ? `Vault · ${d.local_root}` : null) ||
      (d.backend?.includes("api") ? "API" : "Query engine :8765"),
    limitations: d.limitations || null,
    partition: partitionParts.length ? partitionParts.join(" · ") : null,
    joinKeys: joinKeys.length ? joinKeys : null,
    vault: d.local_root || d.local_path || d.vault_path || null,
    use: d.recommended_use || (d.grain ? `Panel at ${d.grain} grain` : null),
  };
}

export function buildSchemaRows(dataset, previewRow) {
  const rows = [];
  if (dataset?.time_field) rows.push({ name: dataset.time_field, type: "DATE/TEXT", note: "Time field" });
  (dataset?.entity_fields || []).forEach((f) => rows.push({ name: f, type: "TEXT", note: "Entity" }));
  (dataset?.join_keys || []).forEach((f) => {
    if (!rows.some((r) => r.name === f)) rows.push({ name: f, type: "TEXT", note: "Join key" });
  });
  if (previewRow) {
    Object.keys(previewRow)
      .slice(0, 12)
      .forEach((k) => {
        if (!rows.some((r) => r.name === k)) {
          const v = previewRow[k];
          rows.push({ name: k, type: typeof v === "number" ? "NUMERIC" : "TEXT", note: "Observed" });
        }
      });
  }
  return rows;
}

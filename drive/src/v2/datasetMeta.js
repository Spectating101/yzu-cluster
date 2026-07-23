/** Map registry rows → frozen UI labels (Detail + StatusPill). */

const META_ACRONYMS = new Set([
  "api",
  "csv",
  "doi",
  "ff3",
  "gdelt",
  "gdrive",
  "hf",
  "json",
  "mops",
  "sec",
  "twse",
  "url",
]);

export function isEmptyishMetaValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return (
    !text ||
    text === "none" ||
    text === "null" ||
    text === "undefined" ||
    text === "n/a" ||
    text === "na" ||
    text === "-" ||
    text === "—"
  );
}

function titleCaseMetaToken(token) {
  const lower = token.toLowerCase();
  if (META_ACRONYMS.has(lower)) return lower.toUpperCase();
  if (/^[a-z]+\d+$/i.test(token)) return token.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatMetaValue(value) {
  if (Array.isArray(value)) {
    return value.map(formatMetaValue).filter(Boolean).join(" · ");
  }
  const text = String(value || "").trim();
  if (isEmptyishMetaValue(text)) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(titleCaseMetaToken)
    .join(" ");
}

/** Exact readiness tokens that mean smoke-proven local query — never fuzzy `/query|ready/`. */
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
 * Map registry readiness to a faculty status.
 * completed ≠ registered ≠ query-ready; unknown/missing never promote to Query-ready.
 */
export function statusPillKind(dataset) {
  if (dataset?.live_identity_badge?.kind && dataset?.live_identity_badge?.label) {
    return dataset.live_identity_badge;
  }
  const readiness = String(dataset?.analysis_readiness || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (dataset?.external || dataset?.collect_via) {
    return { kind: "external", label: "External" };
  }
  if (!readiness) {
    return { kind: "unknown", label: "Readiness unknown" };
  }
  if (isQueryReadyReadiness(readiness)) {
    return { kind: "query-ready", label: "Query-ready" };
  }
  if (readiness === "registered") {
    return { kind: "registered", label: "Registered" };
  }
  if (readiness === "completed" || readiness === "complete") {
    return { kind: "completed", label: "Completed" };
  }
  if (readiness === "dry_run_before_execution" || readiness === "dry_run" || /bigquery/i.test(dataset?.backend || "")) {
    return { kind: "connected", label: "Connected" };
  }
  if (readiness === "connected") return { kind: "connected", label: "Connected" };
  if (readiness === "metadata_search" || readiness === "metadata_only") {
    return { kind: "remote", label: "Metadata only" };
  }
  if (readiness === "procurement_planning") return { kind: "queued", label: "Queued" };
  if (readiness === "sample_now_full_later" || readiness === "minutes_rate_limited") {
    return { kind: "warn", label: "Review" };
  }
  if (readiness === "failed") return { kind: "failed", label: "Failed" };
  return { kind: "unknown", label: "Readiness unknown" };
}

export function statusPill(dataset) {
  return statusPillKind(dataset).label;
}

export function displayName(dataset) {
  return dataset?.name || dataset?.title || dataset?.dataset_id || "Dataset";
}

export function rowSubtitle(dataset) {
  const parts = [dataset?.subtitle || dataset?.dataset_id || dataset?.doi || dataset?.url, formatMetaValue(dataset?.grain)].filter(Boolean);
  const cov = dataset?.coverage || dataset?.date_range;
  if (cov) parts.push(formatMetaValue(cov));
  return parts.join(" · ");
}

export function detailFields(dataset) {
  const d = dataset || {};
  const partitionParts = [
    formatMetaValue(d.grain),
    formatMetaValue(d.coverage || d.date_range || d.temporal_coverage),
  ].filter(Boolean);
  const joinKeys = d.join_keys || [];
  return {
    description: d.description || d.recommended_use || "",
    coverage: formatMetaValue(d.coverage || d.date_range || d.temporal_coverage) || null,
    source: formatMetaValue(d.source || d.publisher || d.domain || d.backend) || null,
    access:
      formatMetaValue(d.access_mode || d.access_shape) ||
      (d.local_root ? `Vault · ${d.local_root}` : null) ||
      (d.backend?.includes("api") ? "API" : "Query engine :8765"),
    limitations: d.limitations || null,
    partition: partitionParts.length ? partitionParts.join(" · ") : null,
    joinKeys: joinKeys.length ? joinKeys : null,
    vault: d.local_root || d.local_path || d.vault_path || null,
    use: d.recommended_use || (d.grain ? `Panel at ${formatMetaValue(d.grain)} grain` : null),
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

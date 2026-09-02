function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return text(item);
        return text(item?.name || item?.label || item?.title || item?.field || item?.column || item?.id);
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[|,]/)
      .map((item) => text(item))
      .filter(Boolean);
  }
  return [];
}

function compactNumber(value) {
  if (value == null || value === "") return "";
  const raw = Number(value);
  if (!Number.isFinite(raw)) return text(value);
  if (raw >= 1_000_000_000) return `${(raw / 1_000_000_000).toFixed(raw >= 10_000_000_000 ? 0 : 1)}B`;
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(raw >= 10_000_000 ? 0 : 1)}M`;
  if (raw >= 1_000) return `${(raw / 1_000).toFixed(raw >= 10_000 ? 0 : 1)}k`;
  return String(raw);
}

function formatBytes(value) {
  if (value == null || value === "") return "";
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return text(value);
  if (raw >= 1024 ** 3) return `${(raw / 1024 ** 3).toFixed(raw >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (raw >= 1024 ** 2) return `${(raw / 1024 ** 2).toFixed(raw >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
  if (raw >= 1024) return `${(raw / 1024).toFixed(raw >= 10 * 1024 ? 0 : 1)} KB`;
  return `${raw} B`;
}

function unique(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const value = text(item);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function first(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function observedFiles(row) {
  const direct = [row?.files, row?.resources, row?.assets].find(Array.isArray) || [];
  const probe = row?.probe_snapshot?.connector?.spec?.discovered_files;
  return direct.length ? direct : Array.isArray(probe) ? probe : [];
}

function observedColumns(row) {
  const direct = [row?.columns, row?.variables, row?.fields].find(Array.isArray) || [];
  return direct;
}

function productKind(row, taxonomy) {
  const explicitKind = text(row?.kind || row?.type || row?.artifact_type).toLowerCase();
  const raw = [explicitKind, row?.format, row?.access_mode, row?.collect_via]
    .map((value) => text(value).toLowerCase())
    .join(" ");
  const files = observedFiles(row);
  const tables = list(row?.tables);
  const isLocal = String(taxonomy?.key || "").startsWith("local-");

  if (isLocal) return { key: "library", label: "Library dataset", concrete: true };
  if (tables.length || /warehouse|snowflake|bigquery|delta|table/.test(raw)) {
    return { key: "warehouse", label: "Queryable tables", concrete: true };
  }
  // An explicitly typed dataset stays a dataset even when CSV/Parquet is its
  // distribution format. Packages are bundles/files, not every tabular file.
  if (/dataset/.test(explicitKind)) {
    return { key: "dataset", label: "Dataset", concrete: true };
  }
  if (files.length || row?.file_summary || /artifact|file|archive|zip|download/.test(explicitKind)) {
    return { key: "package", label: "Data package", concrete: true };
  }
  if (/api|connector|catalog|metadata_search|live_connector|endpoint/.test(raw)) {
    return { key: "route", label: "Queryable source", concrete: false };
  }
  if (row?.dataset_id || row?.schema || row?.schema_summary || observedColumns(row).length || /dataset/.test(raw)) {
    return { key: "dataset", label: "Dataset", concrete: true };
  }
  if (row?.connector_id || (row?.source_id && !files.length && !tables.length)) {
    return { key: "route", label: "Queryable source", concrete: false };
  }
  if (/csv|parquet/.test(raw)) {
    return { key: "dataset", label: "Dataset", concrete: true };
  }
  return { key: "candidate", label: "Data option", concrete: false };
}

function countFact(label, value, noun) {
  if (value == null || value === "") return null;
  const normalized = compactNumber(value);
  return normalized ? { label, value: `${normalized}${noun ? ` ${noun}` : ""}` } : null;
}

/**
 * Normalize a Discover row into an adaptive, truth-preserving data passport.
 * The passport never invents schema/size/row counts. It promotes whatever
 * concrete object facts the backend or a bound probe has actually returned and
 * explicitly identifies the next object facts that remain uninspected.
 */
export function buildDiscoverDataPassport(row = {}, taxonomy = {}) {
  const kind = productKind(row, taxonomy);
  const files = observedFiles(row);
  const columns = observedColumns(row);
  const tables = list(row?.tables);
  const capabilities = unique(list(row?.capabilities).map((item) => item.replaceAll("_", " "))).slice(0, 4);

  const coverage = first(row?.coverage, row?.coverage_summary);
  const grain = first(row?.grain, row?.unit_of_observation);
  const temporal = first(row?.temporal_coverage, row?.date_range, row?.time_range);
  const geography = first(row?.geographic_coverage, row?.geography, row?.region);
  const format = first(row?.format, row?.file_type, row?.content_type, row?.probe_snapshot?.connector?.spec?.content_type);
  const refresh = first(row?.refresh_frequency, row?.refresh, row?.update_frequency, row?.freshness);
  const license = first(row?.license, row?.license_name, row?.terms);
  const version = first(row?.version, row?.revision, row?.dataset_version);
  const size = first(row?.size, row?.size_label) || formatBytes(row?.size_bytes ?? row?.total_bytes ?? row?.bytes);
  const rowCount = row?.row_count ?? row?.rows_count ?? row?.record_count ?? row?.records ?? row?.observations;
  const columnCount = row?.column_count ?? row?.columns_count ?? (columns.length || null);
  const tableCount = row?.table_count ?? row?.tables_count ?? (tables.length || null);
  const fileCount = row?.file_count ?? row?.files_count ?? (files.length || null);
  const splitCount = row?.split_count ?? (Array.isArray(row?.splits) ? row.splits.length : null);
  const endpointCount = row?.endpoint_count ?? (Array.isArray(row?.endpoints) ? row.endpoints.length : null);

  const fieldPreview = unique([
    ...columns.slice(0, 5),
    ...list(row?.schema_summary).slice(0, 2),
  ]);

  const scaleFacts = [
    countFact("Tables", tableCount, Number(tableCount) === 1 ? "table" : "tables"),
    countFact("Files", fileCount, Number(fileCount) === 1 ? "file" : "files"),
    countFact("Fields", columnCount, Number(columnCount) === 1 ? "field" : "fields"),
    countFact("Rows", rowCount, "rows"),
    countFact("Splits", splitCount, Number(splitCount) === 1 ? "split" : "splits"),
    countFact("Endpoints", endpointCount, Number(endpointCount) === 1 ? "endpoint" : "endpoints"),
    size ? { label: "Size", value: size } : null,
  ].filter(Boolean);

  const shapeFacts = unique([
    grain ? `Grain · ${grain}` : "",
    temporal ? `Time · ${temporal}` : "",
    geography ? `Geography · ${geography}` : "",
    format ? `Format · ${format}` : "",
    refresh ? `Updated · ${refresh}` : "",
    version ? `Version · ${version}` : "",
    license ? `License · ${license}` : "",
  ]).slice(0, 5);

  const probeFiles = row?.probe_snapshot?.connector?.spec?.discovered_files;
  const hasProbe = Boolean(row?.probe_snapshot?.observed_at || row?.probe_snapshot?.connector || row?.probe_result);
  const hasSchema = Boolean(row?.schema || row?.schema_summary || columns.length);
  const hasSample = Boolean(row?.sample_rows || row?.sample || row?.preview_rows || row?.preview_supported);
  const hasResourceShape = Boolean(scaleFacts.length || grain || format || fieldPreview.length || tables.length || files.length);

  const inspectNext = [];
  if (!hasSchema) inspectNext.push("schema / fields");
  if (!hasSample) inspectNext.push("sample rows");
  if (!temporal && kind.key !== "route") inspectNext.push("time coverage");
  if (!license && kind.key !== "route") inspectNext.push("license / terms");
  if (!hasProbe && kind.key === "route") inspectNext.push("endpoint response");
  if (!files.length && !tableCount && !endpointCount && kind.key === "route") inspectNext.push("resource manifest");

  const primary = (() => {
    if (kind.key === "route" && capabilities.length) return capabilities.join(" · ");
    if (fieldPreview.length) {
      const suffix = Number(columnCount) > fieldPreview.length ? ` + ${Number(columnCount) - fieldPreview.length} more` : "";
      return `${fieldPreview.join(" · ")}${suffix}`;
    }
    if (coverage) return coverage;
    if (capabilities.length) return capabilities.join(" · ");
    if (grain) return grain;
    return kind.concrete
      ? "Object shape is only partially described in the current result."
      : "This is a source route; inspect it to resolve concrete datasets or files.";
  })();

  const primaryLabel = fieldPreview.length && kind.key !== "route"
    ? "Fields surfaced"
    : kind.concrete
      ? "What this object contains"
      : capabilities.length
        ? "What this source can return"
        : "What this route represents";

  const availability = (() => {
    const key = String(taxonomy?.key || "");
    if (key.startsWith("local-")) return "Already in Library";
    if (key === "external-acquirable") return "Collection route available";
    if (key === "external-probed") return "Source response observed";
    if (key === "licensed-manual") return "Access review required";
    if (key === "external-unavailable") return "No supported route yet";
    return "Needs inspection";
  })();

  return {
    kind: kind.key,
    kindLabel: kind.label,
    concrete: kind.concrete,
    primaryLabel,
    primary,
    scaleFacts,
    shapeFacts,
    capabilities,
    inspectNext: unique(inspectNext).slice(0, 3),
    availability,
    hasResourceShape,
    probeFilesObserved: Array.isArray(probeFiles) ? probeFiles.length : 0,
  };
}

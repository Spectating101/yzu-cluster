import "./discover-analytical-record.css";
import "./discover-analytical-record-final.css";

// Analytical result records deliberately expose only backend/inspection facts.
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
  return [text(value)].filter(Boolean);
}

function first(...values) {
  for (const value of values) {
    const v = text(value);
    if (v) return v;
  }
  return "";
}

function compactNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return text(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function count(value, noun) {
  if (value == null || value === "") return "";
  const n = Number(value);
  const rendered = compactNumber(value);
  if (!rendered) return "";
  return `${rendered} ${n === 1 && noun.endsWith("s") ? noun.slice(0, -1) : noun}`;
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const v = text(value);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function observedColumns(row) {
  return [row?.columns, row?.variables, row?.fields].find(Array.isArray) || [];
}

function observedFiles(row) {
  return [row?.files, row?.resources, row?.assets].find(Array.isArray) || [];
}

function summaryScale(row) {
  const columns = observedColumns(row);
  const files = observedFiles(row);
  const values = [
    count(row?.row_count ?? row?.rows_count ?? row?.record_count ?? row?.records ?? row?.observations, "rows"),
    count(row?.column_count ?? row?.columns_count ?? (columns.length || null), "fields"),
    count(row?.file_count ?? row?.files_count ?? (files.length || null), "files"),
    first(row?.size_label, row?.size),
  ].filter(Boolean);
  return values.join(" · ");
}

function Metric({ label, value }) {
  if (!value) return null;
  return (
    <span className="rd-v2-dataset-profile-metric">
      <b>{label}</b>
      <em>{value}</em>
    </span>
  );
}

export function DiscoverDatasetProfile({ row, passport }) {
  if (!passport) return null;
  const columns = observedColumns(row);
  const capabilities = unique(list(row?.capabilities).map((item) => item.replaceAll("_", " ")));
  const route = passport.kind === "route" || !passport.concrete;
  const coverage = first(row?.coverage, row?.coverage_summary);
  const grain = first(row?.grain, row?.unit_of_observation);
  const temporal = first(row?.temporal_coverage, row?.date_range, row?.time_range);
  const geography = first(row?.geographic_coverage, row?.geography, row?.region);
  const format = first(row?.format, row?.file_type, row?.content_type, row?.probe_snapshot?.connector?.spec?.content_type);
  const refresh = first(row?.refresh_frequency, row?.refresh, row?.update_frequency, row?.freshness, row?.periodicity);
  const license = first(row?.license, row?.license_name, row?.terms);
  const version = first(row?.version, row?.revision, row?.dataset_version);
  const use = first(row?.recommended_use, row?.use_case, row?.research_use);
  const scale = summaryScale(row);
  const fields = unique(columns).slice(0, 6);
  const contents = fields.length
    ? fields.join(" · ")
    : capabilities.length
      ? capabilities.slice(0, 5).join(" · ")
      : passport.primary;
  const remainder = columns.length > fields.length ? columns.length - fields.length : 0;
  const distribution = unique([
    format,
    version ? `Version ${version}` : "",
    license,
  ]).join(" · ");
  const unknowns = unique(passport.inspectNext || []).slice(0, 3);
  const preview = row?.preview_supported === true || row?.sample_rows || row?.preview_rows
    ? "Available"
    : "";

  return (
    <span
      className={`rd-v2-dataset-profile${route ? " is-route" : " is-dataset"}`}
      data-profile-kind={passport.kind}
      aria-label={`${route ? "Source capability" : "Dataset analytical"} profile`}
    >
      <span className="rd-v2-dataset-profile-topline">
        <b>{route ? "DATA SOURCE" : passport.kindLabel.toUpperCase()}</b>
        <em>{passport.availability}</em>
      </span>

      <span className="rd-v2-dataset-profile-body">
        <span className="rd-v2-dataset-profile-contents">
          <b>{route ? "WHAT IT CAN RETURN" : fields.length ? "KEY VARIABLES / CONTENTS" : "DATA CONTENT"}</b>
          <strong>{contents}{remainder ? ` + ${remainder} more` : ""}</strong>
          {use ? <span><b>Research use</b>{use}</span> : null}
        </span>

        <span className="rd-v2-dataset-profile-facts" aria-label="Dataset facts">
          <Metric label="Scale" value={scale} />
          <Metric label="Unit" value={grain} />
          <Metric label="Time" value={temporal} />
          <Metric label="Geography" value={geography} />
          <Metric label={route ? "Output" : "Distribution"} value={distribution || format} />
          <Metric label="Updated" value={refresh} />
          <Metric label="Preview" value={preview} />
        </span>
      </span>

      {coverage ? (
        <span className="rd-v2-dataset-profile-coverage"><b>Coverage</b>{coverage}</span>
      ) : null}

      {unknowns.length ? (
        <span className="rd-v2-dataset-profile-open">
          <b>{route ? "Inspect to resolve" : "Not yet verified"}</b>
          <span>{unknowns.join(" · ")}</span>
        </span>
      ) : null}
    </span>
  );
}

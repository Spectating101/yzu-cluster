import "./discover-analytical-record.css";

// Wide Discover records expose only facts that help a researcher decide
// whether a candidate deserves inspection. Full passport detail remains in Detail.
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

function observedColumns(row) {
  return [row?.columns, row?.variables, row?.fields].find(Array.isArray) || [];
}

function observedFiles(row) {
  return [row?.files, row?.resources, row?.assets].find(Array.isArray) || [];
}

function summaryScale(row) {
  const columns = observedColumns(row);
  const files = observedFiles(row);
  return [
    count(row?.row_count ?? row?.rows_count ?? row?.record_count ?? row?.records ?? row?.observations, "rows"),
    count(row?.column_count ?? row?.columns_count ?? (columns.length || null), "fields"),
    count(row?.file_count ?? row?.files_count ?? (files.length || null), "files"),
    first(row?.size_label, row?.size),
  ].filter(Boolean).join(" · ");
}

function userFacingCaveat(value) {
  const raw = text(value);
  const key = raw.toLowerCase();
  if (!raw) return "";
  if (/schema|fields/.test(key)) return "Field structure not verified";
  if (/sample rows|sample records|preview rows/.test(key)) return "Sample records not inspected";
  if (/time coverage|date range|temporal/.test(key)) return "Exact time coverage not verified";
  if (/license|terms/.test(key)) return "License or terms not verified";
  if (/endpoint response|endpoint/.test(key)) return "Live endpoint not inspected";
  if (/resource manifest|resources/.test(key)) return "Available resources not enumerated";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function Fact({ label, value }) {
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

  const route = passport.kind === "route" || !passport.concrete;
  const columns = observedColumns(row);
  const capabilities = unique(list(row?.capabilities).map((item) => item.replaceAll("_", " ")));
  const fields = unique(columns).slice(0, 6);
  const remainder = columns.length > fields.length ? columns.length - fields.length : 0;
  const contents = fields.length
    ? `${fields.join(" · ")}${remainder ? ` + ${remainder} more` : ""}`
    : capabilities.length
      ? capabilities.slice(0, 5).join(" · ")
      : passport.primary;

  const relevance = unique([
    ...list(row?.relevance_evidence),
    first(row?.relevance_reason, row?.match_reason),
  ]).slice(0, 2).join(" · ");
  const grain = first(row?.grain, row?.unit_of_observation);
  const temporal = first(row?.temporal_coverage, row?.date_range, row?.time_range);
  const geography = first(row?.geographic_coverage, row?.geography, row?.region);
  const coverage = first(row?.coverage, row?.coverage_summary);
  const routeShape = first(row?.output_shape, row?.record_type, row?.entity_type);
  const shape = unique(route ? [routeShape] : [grain, temporal, geography]).join(" · ");

  const format = first(row?.format, row?.file_type, row?.content_type, row?.probe_snapshot?.connector?.spec?.content_type);
  const license = first(row?.license, row?.license_name, row?.terms);
  const version = first(row?.version, row?.revision, row?.dataset_version);
  const refresh = first(row?.refresh_frequency, row?.refresh, row?.update_frequency, row?.freshness, row?.periodicity);
  const delivery = unique([format, version ? `v${version}` : "", license]).join(" · ");
  const scale = summaryScale(row);
  const facts = [
    [route ? "Output" : "Format / terms", delivery || format],
    ["Scale", scale],
    ["Freshness", refresh],
  ].filter(([, value]) => Boolean(value)).slice(0, 3);

  const caveat = userFacingCaveat((passport.inspectNext || [])[0]);

  return (
    <span
      className={`rd-v2-dataset-profile${route ? " is-route" : " is-dataset"}`}
      data-profile-kind={passport.kind}
      aria-label={`${route ? "Source capability" : "Dataset research"} summary`}
    >
      {relevance ? (
        <span className="rd-v2-dataset-profile-match">
          <b>Why it ranked</b>
          <span>{relevance}</span>
        </span>
      ) : null}

      <span className="rd-v2-dataset-profile-contents">
        <b>{route ? "Capabilities" : "Contains"}</b>
        <strong>{contents}</strong>
      </span>

      {shape || coverage ? (
        <span className="rd-v2-dataset-profile-signature">
          {shape ? <span><b>Shape</b><em>{shape}</em></span> : null}
          {coverage ? <span><b>Coverage</b><em>{coverage}</em></span> : null}
        </span>
      ) : null}

      {facts.length ? (
        <span className="rd-v2-dataset-profile-facts" aria-label="Practical source facts">
          {facts.map(([label, value]) => <Fact key={`${label}:${value}`} label={label} value={value} />)}
        </span>
      ) : null}

      {caveat ? (
        <span className="rd-v2-dataset-profile-open">
          <b>Gap</b>
          <span>{caveat}</span>
        </span>
      ) : null}
    </span>
  );
}

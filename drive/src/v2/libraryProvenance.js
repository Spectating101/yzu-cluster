function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(" · ");
  }
  return String(value || "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function httpUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname || parsed.username || parsed.password) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function firstUrl(...values) {
  for (const value of values) {
    const normalized = httpUrl(value);
    if (normalized) return normalized;
  }
  return "";
}

function doiResolver(value) {
  const doi = String(value || "").trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return doi ? `https://doi.org/${doi}` : "";
}

function lineageIds(lineage) {
  const raw = lineage?.upstream_dataset_ids || lineage?.upstream_datasets || lineage?.inputs;
  if (Array.isArray(raw)) return raw.map((item) => String(item || "").trim()).filter(Boolean).join(" · ");
  return text(raw);
}

/**
 * Project the provenance already attached to a Library asset into a single
 * reproducibility receipt. This helper is deliberately fail-closed: provider
 * labels and generic domains never become an "exact source URL" by inference.
 */
export function librarySourceReceipt(dataset = {}) {
  const provenance = asObject(dataset.provenance);
  const procurement = asObject(dataset.procurement);
  const acquisition = asObject(dataset.acquisition);
  const webfetch = asObject(dataset.webfetch);
  const lineage = asObject(dataset.lineage);

  const exactSourceUrl = firstUrl(
    dataset.source_url,
    dataset.landing_url,
    dataset.access_url,
    dataset.url,
    provenance.source_url,
    provenance.url,
    procurement.source_url,
    procurement.url,
    acquisition.source_url,
    acquisition.url,
    webfetch.selected_url,
    webfetch.fetched_url,
  );
  const resolver = exactSourceUrl ? "" : doiResolver(dataset.doi || provenance.doi || procurement.doi || acquisition.doi);

  return {
    sourceUrl: exactSourceUrl || resolver,
    sourceUrlKind: exactSourceUrl ? "Exact source URL" : resolver ? "DOI resolver" : "",
    sourceEndpoint: firstText(dataset.source_endpoint, provenance.source_endpoint, procurement.source_endpoint, acquisition.source_endpoint),
    method: firstText(
      dataset.acquisition_method,
      dataset.collection_method,
      dataset.source_method,
      acquisition.method,
      acquisition.collect_via,
      procurement.method,
      procurement.collect_via,
      provenance.method,
      provenance.collect_via,
      dataset.collect_via,
      dataset.source_collect_via,
      dataset.source_access_mode,
      dataset.access_mode,
      dataset.backend,
    ),
    script: firstText(
      dataset.reproduction_script,
      dataset.acquisition_script,
      dataset.collection_script,
      dataset.pipeline_script,
      dataset.script_path,
      acquisition.script,
      acquisition.script_path,
      procurement.script,
      procurement.script_path,
      provenance.script,
      provenance.script_path,
      lineage.script,
      lineage.script_path,
    ),
    command: firstText(
      dataset.reproduction_command,
      dataset.acquisition_command,
      dataset.collection_command,
      dataset.pipeline_command,
      acquisition.command,
      procurement.command,
      provenance.command,
      lineage.command,
    ),
    route: firstText(
      dataset.source_route,
      dataset.acquisition_route,
      dataset.pipeline_route,
      dataset.source_routes,
      acquisition.route,
      procurement.route,
      provenance.route,
      lineage.route,
    ),
    upstream: lineageIds(lineage),
    fetchedAt: firstText(webfetch.fetched_at, acquisition.fetched_at, procurement.fetched_at, provenance.fetched_at),
    contentSha256: firstText(webfetch.content_sha256, acquisition.content_sha256, procurement.content_sha256, provenance.content_sha256),
  };
}

export function hasReproductionMethod(receipt = {}) {
  return Boolean(receipt.command || receipt.script || receipt.route || receipt.method);
}

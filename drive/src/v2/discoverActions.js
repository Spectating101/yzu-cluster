export function discoverCandidateUrl(row) {
  if (!row) return "";
  const raw = String(row.url || "").trim();
  if (raw) return raw;
  const doi = String(row.doi || "").trim();
  if (doi) {
    const bare = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    return `https://doi.org/${bare}`;
  }
  const handle = String(row.open_handle || "").trim();
  if (handle.startsWith("doi:")) return `https://doi.org/${handle.slice(4)}`;
  return "";
}

export function browseTargetKey(target) {
  if (!target) return "";
  return target.dataset_id || target.url || target.doi || target.title || target.name || "";
}

export function buildAddToLabPrompt(target, probeResult) {
  const label = target?.title || target?.dataset_id || target?.name || "this dataset";
  const connector = probeResult?.connector;
  const summary = probeResult?.summary;
  const payload = {
    title: label,
    dataset_id: target?.dataset_id || null,
    doi: target?.doi || null,
    url: discoverCandidateUrl(target) || null,
    source: target?.source || target?.collect_via || null,
    connector_id: connector?.connector_id || connector?.id || null,
    probe: summary || null,
  };
  return [
    `Add to lab vault: ${label}`,
    "",
    "Candidate (structured):",
    JSON.stringify(payload, null, 2),
    "",
    "If no job was queued, probe the source if needed, then submit yzu_submit_job with a safe collection plan.",
  ].join("\n");
}


export function buildAddToLabDisplayText(target, probeResult, jobId = "") {
  const label = target?.title || target?.dataset_id || target?.name || "this dataset";
  const firstLine = `Add to lab vault: ${label}`;
  if (jobId) return `${firstLine}\nCollection job queued: ${jobId}.`;
  if (probeResult?.summary) {
    return `${firstLine}\nUse the verified source details to prepare a safe collection plan.`;
  }
  return `${firstLine}\nInspect the source if needed, then prepare a safe collection plan.`;
}

export function webHitsToRows(data) {
  const fromSections = (data.sections || []).flatMap((s) => s.rows || []);
  if (fromSections.length) return fromSections;
  return (data.results || []).map((hit) => ({
    kind: "web_hit",
    title: hit.title || hit.url || "Web source",
    url: hit.url,
    source: hit.source || "web",
    description: hit.snippet || hit.content || "",
    publisher: hit.source || "web",
  }));
}

/** Discover Explore/History adapters — map BE contracts to faculty UI rows. */

export function normalizeDiscoverMode(raw = "") {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "history") return "history";
  // Legacy Search/Activity/Approvals collapse to Explore (focusAwaiting handled by discoverMode.js).
  if (mode === "explore" || mode === "search" || mode === "activity" || mode === "approvals" || mode === "awaiting" || !mode) {
    return "explore";
  }
  return "explore";
}

function endpointToUrl(endpoint) {
  const text = String(endpoint || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(text)) return `https://${text}`;
  return "";
}

export function sourceResultToCandidate(row = {}) {
  const label = row.title || row.label || row.name || row.source_id || "External source";
  const caps = Array.isArray(row.capabilities) ? row.capabilities : [];
  const collect = Array.isArray(row.collect_via) ? row.collect_via : row.collect_via ? [row.collect_via] : [];
  const url = row.url || endpointToUrl(row.endpoint);
  return {
    ...row,
    kind: row.kind || "source",
    title: label,
    name: row.name || row.label || label,
    source: row.provider || row.source || row.label,
    publisher: row.provider || row.publisher || row.source,
    description:
      row.description ||
      [row.access_mode, ...caps.slice(0, 3)].filter(Boolean).join(" · "),
    access_mode: row.access_mode || row.access || "",
    collect_via: collect[0] || row.collect_via || "",
    url,
    external: true,
    preview_supported: Boolean(row.preview_supported),
    candidate_key: row.candidate_key || "",
    source_id: row.source_id || "",
    connector_id: row.connector_id || row.desk_connector_id || "",
  };
}

export function sourcesResponseToRows(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map(sourceResultToCandidate);
}

export function durableHistoryToEvents(data) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items
    .filter((item) => item && (item.id || item.title))
    .map((item) => ({
      id: item.id,
      ts: item.updated_at || item.created_at || "",
      action: item.kind || "discover",
      target: item.title || item.summary || item.id,
      meta: {
        status: item.status,
        kind: item.kind,
        summary: item.summary,
        job_id: item.job_id,
        intent_id: item.intent_id,
        candidate_key: item.candidate_key,
        subscription_id: item.subscription_id,
      },
      durable: true,
      status: item.status,
      kind: item.kind,
      summary: item.summary,
    }));
}

export function mergeHistoryEvents(durableEvents = [], deskEvents = []) {
  const seen = new Set();
  const out = [];
  for (const event of [...durableEvents, ...deskEvents]) {
    if (!event) continue;
    const key = String(event.id || `${event.ts}:${event.action}:${event.target}`).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
}

export function historyLifecycleBucket(event) {
  const status = String(event?.status || event?.meta?.status || "").toLowerCase();
  if (/pending_approval|ready_for_review|awaiting|needs_approval/.test(status)) return "needs_approval";
  if (/queued|running|active|in_progress/.test(status)) return "active";
  if (/failed|error|needs_recovery|blocked/.test(status)) return "needs_recovery";
  if (/scheduled|paused|subscription/.test(status) || event?.kind === "subscription" || event?.action === "subscription") {
    return "scheduled";
  }
  if (/completed|ready|registered|archived|done|succeeded/.test(status)) return "ready";
  return "all";
}

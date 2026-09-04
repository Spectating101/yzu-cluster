function text(...values) {
  return values
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "";
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeAccess(raw) {
  if (raw == null || raw === "") return "unknown";
  if (raw === true) return "available";
  if (raw === false) return "restricted";
  const value = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["available", "accessible", "allowed", "read", "read_only", "read_write", "query", "granted", "connected"].includes(value)) {
    return "available";
  }
  if (["restricted", "denied", "blocked", "unavailable", "private", "no_access"].includes(value)) {
    return "restricted";
  }
  return "unknown";
}

function normalizeState(raw) {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["current", "synced", "ready", "healthy", "online"].includes(value)) return "current";
  if (["stale", "outdated", "behind"].includes(value)) return "stale";
  if (["syncing", "refreshing", "updating"].includes(value)) return "syncing";
  if (["offline", "missing", "unavailable", "failed"].includes(value)) return "offline";
  return "unknown";
}

function rawHoldings(dataset = {}) {
  for (const candidate of [dataset.holdings, dataset.storage_holdings, dataset.replicas, dataset.storage_locations]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function holdingAccessLabel(holding) {
  if (holding.access === "available") return "Available";
  if (holding.access === "restricted") return "Restricted";
  return "Access not recorded";
}

export function holdingStateLabel(holding) {
  if (holding.state === "current") return "Current";
  if (holding.state === "stale") return "Stale";
  if (holding.state === "syncing") return "Syncing";
  if (holding.state === "offline") return "Offline";
  return "State not recorded";
}

export function holdingRoleLabel(holding) {
  if (holding.role) return holding.role;
  if (holding.active) return "Active holding";
  if (holding.primary) return "Primary holding";
  if (holding.original) return "Original holding";
  if (holding.queryReady) return "Query-ready replica";
  return "Holding";
}

export function libraryHoldings(dataset = {}) {
  return rawHoldings(dataset)
    .map((raw, index) => {
      const accessRaw = raw?.access ?? raw?.access_state ?? raw?.permission ?? raw?.accessible ?? raw?.authorized;
      const stateRaw = raw?.state ?? raw?.sync_state ?? raw?.replica_state ?? raw?.freshness;
      const provider = text(raw?.provider, raw?.storage_provider, raw?.service, raw?.system, raw?.backend);
      const custodian = text(raw?.custodian, raw?.owner, raw?.account_name, raw?.account, raw?.principal, raw?.institution);
      const location = text(raw?.location, raw?.display_path, raw?.path, raw?.storage_path, raw?.folder, raw?.uri);
      const active = bool(raw?.active ?? raw?.serving ?? raw?.selected);
      const primary = bool(raw?.primary ?? raw?.is_primary);
      const original = bool(raw?.original ?? raw?.is_original ?? raw?.source_holding);
      const queryReady = bool(raw?.query_ready ?? raw?.queryable);
      const role = text(raw?.role, raw?.holding_role, raw?.replica_role);
      const contentHash = text(raw?.content_sha256, raw?.sha256, raw?.content_hash, raw?.hash);
      const version = text(raw?.version, raw?.edition, raw?.snapshot, raw?.as_of);
      const versionId = text(raw?.version_id, raw?.snapshot_id, raw?.revision_id);
      const providerItemId = text(raw?.provider_item_id, raw?.remote_item_id, raw?.file_id, raw?.object_id);
      const parentItemId = text(raw?.parent_item_id, raw?.remote_parent_id, raw?.parent_id);
      const accountId = text(raw?.account_id, raw?.storage_account_id, raw?.principal_id);
      const updatedAt = text(raw?.updated_at, raw?.last_modified, raw?.observed_at, raw?.synced_at);
      const id = text(raw?.holding_id, raw?.id, `${dataset?.dataset_id || "asset"}:holding:${index + 1}`);
      if (![provider, custodian, location, role, contentHash, version].some(Boolean)) return null;
      return {
        id,
        provider: provider || "Storage provider not recorded",
        custodian,
        location,
        role,
        access: normalizeAccess(accessRaw),
        state: normalizeState(stateRaw),
        active,
        primary,
        original,
        queryReady,
        contentHash,
        version,
        versionId,
        providerItemId,
        parentItemId,
        accountId,
        updatedAt,
      };
    })
    .filter(Boolean);
}

export function summarizeLibraryHoldings(dataset = {}) {
  const holdings = libraryHoldings(dataset);
  const availableCount = holdings.filter((holding) => holding.access === "available").length;
  const restrictedCount = holdings.filter((holding) => holding.access === "restricted").length;
  const unknownAccessCount = holdings.length - availableCount - restrictedCount;
  const currentCount = holdings.filter((holding) => holding.state === "current").length;
  const staleCount = holdings.filter((holding) => holding.state === "stale").length;
  const focus = holdings.find((holding) => holding.active) || holdings.find((holding) => holding.primary) || holdings[0] || null;
  const providers = [...new Set(holdings.map((holding) => holding.provider).filter(Boolean))];
  let headline = "No holdings recorded";
  if (holdings.length) {
    const locations = `${holdings.length} location${holdings.length === 1 ? "" : "s"}`;
    if (availableCount) headline = `${locations} · ${availableCount} available`;
    else if (restrictedCount === holdings.length) headline = `${locations} · restricted`;
    else if (unknownAccessCount === holdings.length) headline = `${locations} · access not recorded`;
    else headline = locations;
  }
  return {
    holdings,
    count: holdings.length,
    availableCount,
    restrictedCount,
    unknownAccessCount,
    currentCount,
    staleCount,
    focus,
    providers,
    headline,
  };
}

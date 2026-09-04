import { SUPPORTED_LIBRARY_LOCATIONS } from "./libraryLocations.js";

const KNOWN_LOCATION_STATES = new Set(["disconnected", "indexing", "ready", "error"]);

function clean(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
}

function capabilityList(document = {}, provider = {}) {
  return [
    provider?.directory_browse_available,
    provider?.browse_folders,
    provider?.capabilities?.browse_folders,
    provider?.capabilities?.directory_browse,
    document?.capabilities?.browse_folders?.[provider.id],
    document?.capabilities?.directory_browse?.[provider.id],
  ];
}

function browseAdvertised(document, provider) {
  if (capabilityList(document, provider).some(bool)) return true;
  const ids = document?.capabilities?.folder_browse_providers;
  return Array.isArray(ids) && ids.map((id) => clean(id).toLowerCase()).includes(clean(provider?.id).toLowerCase());
}

function explicitDirectoryState(provider = {}, account = {}) {
  for (const raw of [
    account.directory_state,
    account.index_state,
    provider.directory_state,
    provider.index_state,
  ]) {
    const value = clean(raw).toLowerCase();
    if (KNOWN_LOCATION_STATES.has(value)) return value;
  }
  return "";
}

function accountUsable(account = {}) {
  const state = clean(account.state || account.status).toLowerCase();
  return !["disconnected", "revoked", "expired", "error"].includes(state);
}

/**
 * Convert Settings/Account truth into the tiny Location vocabulary consumed by
 * Library. A connected account is not automatically browsable: the server must
 * explicitly advertise directory browsing for that provider.
 */
export function libraryLocationsFromAccountDocument(document = {}) {
  const providers = Array.isArray(document?.providers) ? document.providers : [];
  const accounts = Array.isArray(document?.accounts) ? document.accounts : [];
  const providerById = new Map(providers.map((provider) => [clean(provider?.id).toLowerCase(), provider]));

  return SUPPORTED_LIBRARY_LOCATIONS.map((supported) => {
    const provider = providerById.get(supported.id) || { id: supported.id, label: supported.label };
    const providerAccounts = accounts.filter(
      (account) => clean(account?.provider).toLowerCase() === supported.id && accountUsable(account),
    );
    const account = providerAccounts.find((item) => item?.verified_at) || providerAccounts[0] || null;
    const hasAccount = Boolean(account);
    const directoryReady = hasAccount && browseAdvertised(document, provider);
    const explicit = explicitDirectoryState(provider, account || {});
    let state = "disconnected";
    if (hasAccount) {
      state = explicit || (directoryReady ? "ready" : "indexing");
      if (state === "ready" && !directoryReady) state = "indexing";
    }

    return {
      id: supported.id,
      label: supported.label,
      state,
      connected: hasAccount,
      accountId: clean(account?.id),
      accountLabel: clean(account?.label || account?.email),
      rootId: clean(account?.root_id || provider?.root_id),
      accessMode: clean(account?.access_mode || provider?.default_access_mode || "read"),
      directoryBrowseAvailable: directoryReady,
    };
  });
}

function canonicalById(holdings = []) {
  return new Map(
    (Array.isArray(holdings) ? holdings : [])
      .filter(Boolean)
      .map((row) => [clean(row?.logical_asset_id || row?.dataset_id || row?.registry_id), row])
      .filter(([id]) => Boolean(id)),
  );
}

export function providerDirectoryRows({
  items = [],
  holdings = [],
  providerId = "",
  providerLabel = "",
} = {}) {
  const known = canonicalById(holdings);
  const provider = clean(providerId);
  const label = clean(providerLabel) || provider;
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item.kind === "folder") {
      return {
        kind: "folder",
        id: `remote:${provider}:${item.providerItemId}`,
        name: item.name,
        remoteProvider: provider,
        providerItemId: item.providerItemId,
        parentItemId: item.parentItemId,
        remotePath: item.path,
        remoteSummary: {
          desc: item.contentAccess === "restricted" ? "Content access is restricted for this connected account." : null,
          sub: item.path || `${label} folder`,
          pill: Number.isFinite(item.childCount) && item.childCount >= 0 ? String(item.childCount) : "→",
        },
      };
    }

    const canonical = item.logicalAssetId ? known.get(clean(item.logicalAssetId)) : null;
    if (canonical) {
      return {
        kind: "dataset",
        id: clean(canonical.dataset_id || canonical.registry_id || item.logicalAssetId),
        row: {
          ...canonical,
          __provider_holding: {
            provider,
            provider_item_id: item.providerItemId,
            parent_item_id: item.parentItemId,
            path: item.path,
            content_access: item.contentAccess,
          },
        },
        pathLabel: item.path || `${label} holding`,
        remoteProvider: provider,
        providerItemId: item.providerItemId,
      };
    }

    return {
      kind: "remote_file",
      id: `remote:${provider}:${item.providerItemId}`,
      name: item.name,
      provider,
      providerLabel: label,
      providerItemId: item.providerItemId,
      parentItemId: item.parentItemId,
      path: item.path,
      mimeType: item.mimeType,
      modifiedAt: item.modifiedAt,
      sizeBytes: item.sizeBytes,
      contentAccess: item.contentAccess,
      metadataVisible: item.metadataVisible,
      logicalAssetId: item.logicalAssetId,
    };
  });
}

export function filterProviderDirectoryRows(rows = [], query = "") {
  const q = clean(query).toLowerCase();
  if (!q) return [...rows];
  return (Array.isArray(rows) ? rows : []).filter((item) => {
    const row = item?.row || item;
    const text = [
      item?.name,
      item?.path,
      item?.remotePath,
      item?.providerLabel,
      row?.name,
      row?.display_name,
      row?.title,
      row?.dataset_id,
      row?.source,
      row?.grain,
    ]
      .map(clean)
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(q);
  });
}

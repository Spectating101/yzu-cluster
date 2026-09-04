export const LIBRARY_DIRECTORY_PAGE_SIZE = 50;

export const SUPPORTED_LIBRARY_LOCATIONS = Object.freeze([
  { id: "google_drive", label: "Google Drive" },
  { id: "dropbox", label: "Dropbox" },
]);

const KNOWN_STATES = new Set(["disconnected", "indexing", "ready", "error"]);

function stateOf(value) {
  const raw = String(value || "").trim().toLowerCase();
  return KNOWN_STATES.has(raw) ? raw : "disconnected";
}

export function normalizeLibraryLocations(locations = []) {
  const supplied = new Map(
    (Array.isArray(locations) ? locations : [])
      .filter(Boolean)
      .map((item) => [String(item.id || item.provider || "").trim().toLowerCase(), item]),
  );

  return [
    { id: "all", label: "All", state: "ready", connected: true, builtIn: true },
    ...SUPPORTED_LIBRARY_LOCATIONS.map((supported) => {
      const item = supplied.get(supported.id) || {};
      const state = stateOf(item.state || (item.connected ? "ready" : "disconnected"));
      return {
        ...supported,
        state,
        connected: state !== "disconnected",
        accountId: item.accountId || item.account_id || "",
        accountLabel: item.accountLabel || item.account_label || "",
        rootId: item.rootId || item.root_id || "",
        accessMode: item.accessMode || item.access_mode || "",
        directoryBrowseAvailable: Boolean(item.directoryBrowseAvailable ?? item.directory_browse_available ?? false),
      };
    }),
  ];
}

export function isBrowsableLibraryLocation(location, hasDirectoryHandler = false) {
  if (!location) return false;
  if (location.id === "all") return true;
  return Boolean(hasDirectoryHandler && location.state === "ready");
}

export function libraryLocationStatusLabel(location) {
  if (!location || location.id === "all") return "Available";
  if (location.state === "ready") return "Connected";
  if (location.state === "indexing") return "Indexing";
  if (location.state === "error") return "Reconnect needed";
  return "Not connected";
}

export function providerDirectoryRequest({
  providerId,
  accountId = "",
  parentId = "",
  cursor = "",
  limit = LIBRARY_DIRECTORY_PAGE_SIZE,
} = {}) {
  const provider = String(providerId || "").trim().toLowerCase();
  if (!SUPPORTED_LIBRARY_LOCATIONS.some((item) => item.id === provider)) {
    throw new Error(`Unsupported Library location: ${provider || "missing"}`);
  }
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || LIBRARY_DIRECTORY_PAGE_SIZE));
  return {
    provider,
    account_id: String(accountId || "").trim(),
    parent_id: String(parentId || ""),
    cursor: String(cursor || ""),
    limit: safeLimit,
  };
}

export function normalizeProviderDirectoryPage(payload = {}) {
  const rawItems = payload.items || payload.rows || payload.entries || [];
  const items = (Array.isArray(rawItems) ? rawItems : []).map((item) => ({
    providerItemId: String(item.providerItemId || item.provider_item_id || item.id || ""),
    parentItemId: String(item.parentItemId || item.parent_item_id || item.parent_id || ""),
    name: String(item.name || item.label || "Untitled"),
    kind: item.kind === "folder" || item.is_folder === true ? "folder" : "file",
    logicalAssetId: String(item.logicalAssetId || item.logical_asset_id || ""),
    path: String(item.path || item.display_path || ""),
    metadataVisible: item.metadataVisible !== false && item.metadata_visible !== false,
    contentAccess: String(item.contentAccess || item.content_access || "unknown"),
    childCount: Number.isFinite(Number(item.childCount ?? item.child_count)) ? Number(item.childCount ?? item.child_count) : null,
    modifiedAt: String(item.modifiedAt || item.modified_at || item.modified_time || ""),
    mimeType: String(item.mimeType || item.mime_type || ""),
    sizeBytes: Number.isFinite(Number(item.sizeBytes ?? item.size_bytes ?? item.size)) ? Number(item.sizeBytes ?? item.size_bytes ?? item.size) : null,
    accountId: String(item.accountId || item.account_id || payload.accountId || payload.account_id || ""),
    versionId: String(item.versionId || item.version_id || item.revision_id || item.version || ""),
    contentHash: String(item.contentHash || item.content_hash || item.content_sha256 || item.sha256 || ""),
  }));

  return {
    items,
    accountId: String(payload.accountId || payload.account_id || ""),
    nextCursor: String(payload.nextCursor || payload.next_cursor || payload.cursor || ""),
    hasMore: Boolean(payload.hasMore ?? payload.has_more ?? false),
  };
}

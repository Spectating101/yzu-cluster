from pathlib import Path
from textwrap import dedent


def write(path, content):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(dedent(content).lstrip(), encoding="utf-8")


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor for {label}: {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


write("drive/src/v2/connectedAccountsApi.js", r'''
import { fetchJson } from "./api.js";
import { deskHeaders } from "./deskSession.js";

export function listConnectedAccounts() {
  return fetchJson("/library/accounts");
}

export function startConnectedAccountOauth(provider, accessMode = "read") {
  return fetchJson("/library/accounts/oauth/start", {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({
      provider: String(provider || "").trim(),
      access_mode: String(accessMode || "read").trim(),
    }),
  });
}

export function completeConnectedAccountOauth(provider, state, code) {
  return fetchJson("/library/accounts/oauth/complete", {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({
      provider: String(provider || "").trim(),
      state: String(state || "").trim(),
      code: String(code || "").trim(),
    }),
  });
}

export function verifyConnectedAccount(accountId) {
  return fetchJson(`/library/accounts/${encodeURIComponent(accountId)}/verify`, {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({}),
  });
}

export function disconnectConnectedAccount(accountId) {
  return fetchJson(`/library/accounts/${encodeURIComponent(accountId)}/disconnect`, {
    method: "POST",
    headers: deskHeaders(),
    body: JSON.stringify({}),
  });
}
''')

write("drive/src/v2/libraryFederationApi.js", r'''
import { fetchJson } from "./api.js";
import { normalizeProviderDirectoryPage, providerDirectoryRequest } from "./libraryLocations.js";

/**
 * Provider-neutral directory endpoint. The private API owns OAuth credentials,
 * provider SDK/rclone details, permission checks, and provider cursors.
 */
export async function listLibraryProviderDirectory({
  providerId,
  parentId = "",
  cursor = "",
  limit,
} = {}) {
  const request = providerDirectoryRequest({ providerId, parentId, cursor, limit });
  const params = new URLSearchParams();
  params.set("provider", request.provider);
  if (request.parent_id) params.set("parent_id", request.parent_id);
  if (request.cursor) params.set("cursor", request.cursor);
  params.set("limit", String(request.limit));
  const payload = await fetchJson(`/library/folders?${params.toString()}`, { timeoutMs: 20_000 });
  return normalizeProviderDirectoryPage(payload);
}
''')

write("drive/src/v2/libraryFederationRuntime.js", r'''
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
''')

write("drive/src/v2/libraryFederationRuntime.test.js", r'''
import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProviderDirectoryRows,
  libraryLocationsFromAccountDocument,
  providerDirectoryRows,
} from "./libraryFederationRuntime.js";


test("connected storage is not browsable until server advertises directory capability", () => {
  const locations = libraryLocationsFromAccountDocument({
    providers: [
      { id: "google_drive", label: "Google Drive", configured: true, rclone_available: true },
      { id: "dropbox", label: "Dropbox", configured: true, rclone_available: true },
    ],
    accounts: [{ id: "g1", provider: "google_drive", email: "prof@example.edu", verified_at: "2026-09-04T00:00:00Z" }],
  });
  assert.equal(locations.find((item) => item.id === "google_drive")?.state, "indexing");
  assert.equal(locations.find((item) => item.id === "dropbox")?.state, "disconnected");
});


test("advertised provider directory becomes ready without inferring from holdings", () => {
  const locations = libraryLocationsFromAccountDocument({
    providers: [{ id: "google_drive", directory_browse_available: true }],
    accounts: [{ id: "g1", provider: "google_drive", label: "Research account" }],
  });
  const drive = locations.find((item) => item.id === "google_drive");
  assert.equal(drive?.state, "ready");
  assert.equal(drive?.accountId, "g1");
  assert.equal(drive?.directoryBrowseAvailable, true);
});


test("remote directory resolves known holdings to canonical Library identity and preserves unknown files", () => {
  const rows = providerDirectoryRows({
    providerId: "google_drive",
    providerLabel: "Google Drive",
    holdings: [{ dataset_id: "asia_panel", name: "Asia panel", analysis_readiness: "instant" }],
    items: [
      { kind: "folder", providerItemId: "folder-1", name: "Research", path: "My Drive / Research", childCount: 4 },
      { kind: "file", providerItemId: "file-known", name: "asia.csv", logicalAssetId: "asia_panel", path: "My Drive / Research / asia.csv", contentAccess: "available" },
      { kind: "file", providerItemId: "file-new", name: "forgotten.csv", path: "My Drive / Research / forgotten.csv", contentAccess: "available" },
    ],
  });
  assert.equal(rows[0].kind, "folder");
  assert.equal(rows[1].kind, "dataset");
  assert.equal(rows[1].row.dataset_id, "asia_panel");
  assert.equal(rows[2].kind, "remote_file");
  assert.equal(rows[2].name, "forgotten.csv");
  assert.equal(filterProviderDirectoryRows(rows, "forgotten").length, 1);
});
''')

write("drive/src/v2/libraryEvidenceGraph.js", r'''
import { libraryHoldings } from "./libraryHoldings.js";

function clean(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function lineageIds(dataset = {}) {
  const lineage = dataset?.lineage || {};
  const candidates = [
    dataset?.upstream_dataset_ids,
    dataset?.derived_from,
    dataset?.source_dataset_ids,
    lineage?.upstream_dataset_ids,
    lineage?.upstream,
    lineage?.parents,
    lineage?.derived_from,
  ];
  const out = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item === "string" || typeof item === "number") out.push(item);
        else out.push(item?.dataset_id || item?.logical_asset_id || item?.id);
      }
    } else if (candidate && typeof candidate === "string") {
      out.push(...candidate.split(/[;,]/));
    }
  }
  return unique(out);
}

export function libraryEvidenceGraph(dataset = {}) {
  const logicalAssetId = clean(dataset.logical_asset_id || dataset.dataset_id || dataset.registry_id || dataset.doi || dataset.url);
  const contentHash = clean(dataset.content_sha256 || dataset.sha256 || dataset.content_hash);
  const versionId = clean(dataset.version_id || dataset.snapshot_id || dataset.version || contentHash || "current");
  const holdings = libraryHoldings(dataset);
  const upstream = lineageIds(dataset);
  return {
    logicalAssetId,
    version: {
      id: versionId,
      label: clean(dataset.version_label || dataset.version || dataset.edition || "Current registered version"),
      contentHash,
      dataAsOf: clean(dataset.data_as_of || dataset.as_of),
    },
    holdings,
    lineage: {
      upstream,
      relation: upstream.length ? clean(dataset.lineage?.relation || dataset.lineage_relation || "derived_from") : "",
    },
    access: {
      metadataVisible: dataset.metadata_visible !== false,
      contentAccess: clean(dataset.content_access || dataset.access_state || dataset.access_mode || "unknown"),
    },
  };
}

export function libraryUsageEvent({
  dataset = {},
  action,
  projectId = "",
  relatedAssetIds = [],
  outputId = "",
  at = "",
  context = {},
} = {}) {
  const graph = libraryEvidenceGraph(dataset);
  const occurredAt = clean(at) || new Date().toISOString();
  const actionName = clean(action);
  if (!graph.logicalAssetId) throw new Error("Library usage event requires a logical asset id");
  if (!actionName) throw new Error("Library usage event requires an action");
  return {
    event_type: "library_evidence_usage",
    logical_asset_id: graph.logicalAssetId,
    version_id: graph.version.id,
    action: actionName,
    project_id: clean(projectId),
    related_asset_ids: unique(relatedAssetIds),
    output_id: clean(outputId),
    occurred_at: occurredAt,
    context: context && typeof context === "object" ? { ...context } : {},
  };
}
''')

write("drive/src/v2/libraryEvidenceGraph.test.js", r'''
import test from "node:test";
import assert from "node:assert/strict";
import { libraryEvidenceGraph, libraryUsageEvent } from "./libraryEvidenceGraph.js";


test("evidence graph keeps logical identity separate from versions and storage holdings", () => {
  const graph = libraryEvidenceGraph({
    dataset_id: "panel-1",
    version_id: "v4",
    content_sha256: "abc123",
    holdings: [
      { holding_id: "h1", provider: "Google Drive", provider_item_id: "g-9", account_id: "acct-1", path: "/Research/panel.csv", access: "read" },
      { holding_id: "h2", provider: "YZUC cluster", path: "/query/panel.parquet", query_ready: true, access: "read" },
    ],
    lineage: { upstream_dataset_ids: ["raw-a", "raw-b"] },
  });
  assert.equal(graph.logicalAssetId, "panel-1");
  assert.equal(graph.version.id, "v4");
  assert.equal(graph.holdings.length, 2);
  assert.equal(graph.holdings[0].providerItemId, "g-9");
  assert.deepEqual(graph.lineage.upstream, ["raw-a", "raw-b"]);
});


test("usage event is a durable backend envelope, not UI-local prose", () => {
  const event = libraryUsageEvent({
    dataset: { dataset_id: "panel-1", version_id: "v4" },
    action: "query",
    projectId: "thesis",
    relatedAssetIds: ["macro", "macro", "events"],
    outputId: "query-42",
    at: "2026-09-04T15:00:00Z",
    context: { grain: "country_day" },
  });
  assert.equal(event.logical_asset_id, "panel-1");
  assert.equal(event.version_id, "v4");
  assert.deepEqual(event.related_asset_ids, ["macro", "events"]);
  assert.equal(event.occurred_at, "2026-09-04T15:00:00Z");
});
''')

# Extend provider directory normalization with stable provider/access metadata.
replace_once(
    "drive/src/v2/libraryLocations.js",
    '''    contentAccess: String(item.contentAccess || item.content_access || "unknown"),\n  }));''',
    '''    contentAccess: String(item.contentAccess || item.content_access || "unknown"),\n    childCount: Number.isFinite(Number(item.childCount ?? item.child_count)) ? Number(item.childCount ?? item.child_count) : null,\n    modifiedAt: String(item.modifiedAt || item.modified_at || item.modified_time || ""),\n    mimeType: String(item.mimeType || item.mime_type || ""),\n    sizeBytes: Number.isFinite(Number(item.sizeBytes ?? item.size_bytes ?? item.size)) ? Number(item.sizeBytes ?? item.size_bytes ?? item.size) : null,\n    accountId: String(item.accountId || item.account_id || ""),\n  }));''',
    "provider page metadata",
)

# Keep provider/account identity on holdings rather than path-only identity.
replace_once(
    "drive/src/v2/libraryHoldings.js",
    '''      const version = text(raw?.version, raw?.edition, raw?.snapshot, raw?.as_of);\n      const updatedAt = text(raw?.updated_at, raw?.last_modified, raw?.observed_at, raw?.synced_at);\n      const id = text(raw?.holding_id, raw?.id, `${dataset?.dataset_id || "asset"}:holding:${index + 1}`);''',
    '''      const version = text(raw?.version, raw?.edition, raw?.snapshot, raw?.as_of);\n      const versionId = text(raw?.version_id, raw?.snapshot_id, raw?.revision_id);\n      const providerItemId = text(raw?.provider_item_id, raw?.remote_item_id, raw?.file_id, raw?.object_id);\n      const parentItemId = text(raw?.parent_item_id, raw?.remote_parent_id, raw?.parent_id);\n      const accountId = text(raw?.account_id, raw?.storage_account_id, raw?.principal_id);\n      const updatedAt = text(raw?.updated_at, raw?.last_modified, raw?.observed_at, raw?.synced_at);\n      const id = text(raw?.holding_id, raw?.id, `${dataset?.dataset_id || "asset"}:holding:${index + 1}`);''',
    "holding provider identity fields",
)
replace_once(
    "drive/src/v2/libraryHoldings.js",
    '''        contentHash,\n        version,\n        updatedAt,''',
    '''        contentHash,\n        version,\n        versionId,\n        providerItemId,\n        parentItemId,\n        accountId,\n        updatedAt,''',
    "holding provider identity return",
)

# CatalogList: preserve existing client pagination for local folders, but allow
# cursor-backed server pagination for connected provider directories.
write("drive/src/v2/CatalogList.jsx", r'''
import { useEffect, useMemo, useState } from "react";
import { CatalogRow } from "@/v2/CatalogRow";
import "@/v2/library-live-scale.css";

const PAGE_SIZE = 50;

function rowKey(item) {
  if (item?.kind === "folder") return `folder:${item.id}`;
  if (item?.kind === "remote_file") return `remote:${item.id}`;
  const dataset = item?.row || item;
  return `dataset:${item?.id || dataset?.dataset_id || dataset?.title || dataset?.url}`;
}

function isSelected(item, selectedId) {
  if (item?.kind === "folder" || item?.kind === "remote_file") return false;
  const dataset = item?.row || item;
  return selectedId === (item?.id || dataset?.dataset_id || dataset?.title || dataset?.url);
}

function paginationNoun(rows = []) {
  const folders = rows.filter((item) => item?.kind === "folder").length;
  const assets = rows.length - folders;
  if (folders === rows.length) return "folders";
  if (assets === rows.length) return "assets";
  return "entries";
}

/** Drive-style list — folders + evidence objects in one scroll. */
export function CatalogList({
  rows = [],
  selectedId,
  onSelectDataset,
  onSelectRemoteFile,
  onOpenFolder,
  onDoubleClick,
  compact = true,
  external = false,
  rowState,
  serverPaginated = false,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    if (serverPaginated) return;
    setVisibleLimit((limit) => {
      if (rows.length <= PAGE_SIZE) return PAGE_SIZE;
      return Math.min(Math.max(limit, PAGE_SIZE), rows.length);
    });
  }, [rows.length, serverPaginated]);

  const visibleRows = useMemo(
    () => (serverPaginated ? rows : rows.slice(0, visibleLimit)),
    [rows, serverPaginated, visibleLimit],
  );
  const clientHasMore = visibleRows.length < rows.length;
  const noun = paginationNoun(rows);

  if (!rows.length) return null;

  return (
    <>
      <ul className="rd-v2-catalog rd-v2-catalog-list" aria-label="Catalog">
        {visibleRows.map((item) => (
          <CatalogRow
            key={rowKey(item)}
            item={item}
            selected={isSelected(item, selectedId)}
            compact={compact}
            external={external || item?.external}
            rowState={rowState}
            onSelect={onSelectDataset}
            onSelectRemoteFile={onSelectRemoteFile}
            onOpenFolder={onOpenFolder}
            onDoubleClick={onDoubleClick}
          />
        ))}
      </ul>
      {serverPaginated ? (
        hasMore ? (
          <div className="rd-v2-library-pagination directory" aria-label="Directory pagination">
            <span>{rows.length} {noun} loaded</span>
            <button type="button" className="rd-v2-btn sm" disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore ? "Loading…" : "Load 50 more"}
            </button>
          </div>
        ) : null
      ) : rows.length > PAGE_SIZE ? (
        <div className="rd-v2-library-pagination directory" aria-label="Directory pagination">
          <span>Showing {visibleRows.length} of {rows.length} {noun}</span>
          {clientHasMore ? (
            <button type="button" className="rd-v2-btn sm" onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}>
              Load {Math.min(PAGE_SIZE, rows.length - visibleRows.length)} more
            </button>
          ) : (
            <button type="button" className="rd-v2-btn sm ghost" onClick={() => setVisibleLimit(PAGE_SIZE)}>
              Back to first {PAGE_SIZE}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
''')

# CatalogRow: remote folders use provider-native path summaries and unknown
# remote files remain visibly outside Library instead of becoming fake datasets.
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''  const isFolder = item.kind === "folder";\n  const dataset = item.row || item;\n  const assetKind = isFolder ? "folder" : libraryAssetKind(dataset);\n  const isScholarly = assetKind === "scholarly_work";\n  const title = isFolder ? item.name : displayName(dataset);\n  const folderSummary = isFolder ? folderBrowseSummary(item) : null;''',
    '''  const isFolder = item.kind === "folder";\n  const isRemoteFile = item.kind === "remote_file";\n  const dataset = item.row || item;\n  const assetKind = isFolder ? "folder" : isRemoteFile ? "remote_file" : libraryAssetKind(dataset);\n  const isScholarly = assetKind === "scholarly_work";\n  const title = isFolder || isRemoteFile ? item.name : displayName(dataset);\n  const folderSummary = isFolder ? (item.remoteSummary || folderBrowseSummary(item)) : null;''',
    "CatalogRow remote identity",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''  const sub = isFolder\n    ? folderSummary.sub\n    : isScholarly\n      ? scholarlySubtitle(dataset)\n      : rowSubtitle(dataset);''',
    '''  const sub = isFolder\n    ? folderSummary.sub\n    : isRemoteFile\n      ? [item.providerLabel, item.path || item.mimeType].filter(Boolean).join(" · ")\n      : isScholarly\n        ? scholarlySubtitle(dataset)\n        : rowSubtitle(dataset);''',
    "CatalogRow remote subtitle",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''  const desc = isFolder\n    ? folderSummary.desc\n    : compact\n      ? null\n      : datasetDescription(dataset);''',
    '''  const desc = isFolder\n    ? folderSummary.desc\n    : isRemoteFile\n      ? (item.contentAccess === "restricted" ? "Metadata is visible, but this account cannot read the file content." : null)\n      : compact\n        ? null\n        : datasetDescription(dataset);''',
    "CatalogRow remote description",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''  const state = !isFolder && rowState ? rowState(dataset) : null;\n  const kind = isFolder ? "folder" : external ? "external" : assetKind.replace(/_/g, "-");''',
    '''  const state = !isFolder && !isRemoteFile && rowState ? rowState(dataset) : null;\n  const kind = isFolder ? "folder" : isRemoteFile ? "remote-file" : external ? "external" : assetKind.replace(/_/g, "-");''',
    "CatalogRow remote state",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''  onSelect,\n  onOpenFolder,''',
    '''  onSelect,\n  onSelectRemoteFile,\n  onOpenFolder,''',
    "CatalogRow remote callback prop",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''        onClick={() => (isFolder ? onOpenFolder(item) : onSelect(dataset))}\n        onDoubleClick={() => {\n          if (!isFolder && onDoubleClick) onDoubleClick(dataset);\n        }}''',
    '''        disabled={isRemoteFile && !onSelectRemoteFile}\n        onClick={() => (isFolder ? onOpenFolder(item) : isRemoteFile ? onSelectRemoteFile?.(item) : onSelect(dataset))}\n        onDoubleClick={() => {\n          if (!isFolder && !isRemoteFile && onDoubleClick) onDoubleClick(dataset);\n        }}''',
    "CatalogRow remote click",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''          ) : isFolder ? (\n            <FolderRowIcon />\n          ) : isScholarly ? (''',
    '''          ) : isFolder ? (\n            <FolderRowIcon />\n          ) : isRemoteFile ? (\n            <ScholarlyWorkIcon />\n          ) : isScholarly ? (''',
    "CatalogRow remote icon",
)
replace_once(
    "drive/src/v2/CatalogRow.jsx",
    '''        {!isFolder && state ? (\n          <span className={`rd-v2-pill ${state.className}`}>{state.label}</span>\n        ) : null}\n        {!isFolder && !state ? <StatusPill dataset={dataset} label={statusPill(dataset)} /> : null}\n        {isFolder ? (''',
    '''        {!isFolder && !isRemoteFile && state ? (\n          <span className={`rd-v2-pill ${state.className}`}>{state.label}</span>\n        ) : null}\n        {!isFolder && !isRemoteFile && !state ? <StatusPill dataset={dataset} label={statusPill(dataset)} /> : null}\n        {isRemoteFile ? (\n          <span className={`rd-v2-pill ${item.contentAccess === "restricted" ? "warn" : "muted"}`}>\n            {item.contentAccess === "restricted" ? "No access" : "Not in Library"}\n          </span>\n        ) : null}\n        {isFolder ? (''',
    "CatalogRow remote badge",
)

# LibraryPage federation runtime: remote provider folders use the same Folder
# surface, breadcrumbs, filters, dossier selection, and cursor pagination.
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''import { isBrowsableLibraryLocation, normalizeLibraryLocations } from "@/v2/libraryLocations";''',
    '''import { isBrowsableLibraryLocation, normalizeLibraryLocations } from "@/v2/libraryLocations";\nimport { filterProviderDirectoryRows, providerDirectoryRows } from "@/v2/libraryFederationRuntime";''',
    "LibraryPage federation import",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''function LibraryBreadcrumb({ trail, onFolderChange }) {''',
    '''function LibraryBreadcrumb({ trail, onFolderChange, onRemoteFolderChange }) {''',
    "LibraryBreadcrumb remote prop",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''              <button type="button" onClick={() => onFolderChange(c.id)}>\n                {c.name}\n              </button>''',
    '''              <button type="button" onClick={() => (c.remote ? onRemoteFolderChange?.(c) : onFolderChange(c.id))}>\n                {c.name}\n              </button>''',
    "LibraryBreadcrumb remote action",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  folderLocations = [],\n  onFolderLocationChange,\n  referenceCount = 0,''',
    '''  folderLocations = [],\n  onFolderLocationChange,\n  loadFolderLocationDirectory,\n  referenceCount = 0,''',
    "LibraryPage federation props",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const [newMenuOpen, setNewMenuOpen] = useState(false);\n  const searchInputRef = useRef(null);''',
    '''  const [newMenuOpen, setNewMenuOpen] = useState(false);\n  const [remoteDirectory, setRemoteDirectory] = useState({\n    providerId: "", parentId: "", trail: [], items: [], nextCursor: "", hasMore: false, loading: false, loadingMore: false, error: "",\n  });\n  const remoteRequestRef = useRef(0);\n  const searchInputRef = useRef(null);''',
    "LibraryPage remote state",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  useEffect(() => {\n    if (locationMode === "all") return;\n    const active = normalizedFolderLocations.find((location) => location.id === locationMode);\n    if (!isBrowsableLibraryLocation(active, Boolean(onFolderLocationChange))) setLocationMode("all");\n  }, [locationMode, normalizedFolderLocations, onFolderLocationChange]);\n\n  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);''',
    '''  const resetRemoteDirectory = useCallback(() => {\n    remoteRequestRef.current += 1;\n    setRemoteDirectory({ providerId: "", parentId: "", trail: [], items: [], nextCursor: "", hasMore: false, loading: false, loadingMore: false, error: "" });\n  }, []);\n\n  const loadRemoteDirectory = useCallback(async ({ providerId, parentId = "", trail: nextTrail = [], cursor = "", append = false } = {}) => {\n    if (!loadFolderLocationDirectory || !providerId) return;\n    const requestId = ++remoteRequestRef.current;\n    setRemoteDirectory((current) => ({\n      ...current,\n      providerId,\n      parentId,\n      trail: nextTrail,\n      loading: !append,\n      loadingMore: append,\n      error: "",\n      ...(append ? {} : { items: [], nextCursor: "", hasMore: false }),\n    }));\n    try {\n      const page = await loadFolderLocationDirectory({ providerId, parentId, cursor, limit: 50 });\n      if (requestId !== remoteRequestRef.current) return;\n      setRemoteDirectory((current) => ({\n        ...current,\n        providerId,\n        parentId,\n        trail: nextTrail,\n        items: append ? [...current.items, ...(page?.items || [])] : (page?.items || []),\n        nextCursor: page?.nextCursor || "",\n        hasMore: Boolean(page?.hasMore),\n        loading: false,\n        loadingMore: false,\n        error: "",\n      }));\n    } catch (error) {\n      if (requestId !== remoteRequestRef.current) return;\n      setRemoteDirectory((current) => ({\n        ...current,\n        loading: false,\n        loadingMore: false,\n        error: String(error?.message || error),\n      }));\n    }\n  }, [loadFolderLocationDirectory]);\n\n  useEffect(() => {\n    if (locationMode === "all") return;\n    const active = normalizedFolderLocations.find((location) => location.id === locationMode);\n    if (!isBrowsableLibraryLocation(active, Boolean(loadFolderLocationDirectory))) {\n      setLocationMode("all");\n      resetRemoteDirectory();\n    }\n  }, [loadFolderLocationDirectory, locationMode, normalizedFolderLocations, resetRemoteDirectory]);\n\n  const remoteActive = browsingPhysicalFolders && locationMode !== "all";\n  const providerLocation = normalizedFolderLocations.find((location) => location.id === locationMode) || null;\n  const remoteRows = useMemo(() => providerDirectoryRows({\n    items: remoteDirectory.items,\n    holdings: allHeldDatasets,\n    providerId: locationMode,\n    providerLabel: providerLocation?.label || locationMode,\n  }), [allHeldDatasets, locationMode, providerLocation?.label, remoteDirectory.items]);\n  const searchedRemoteRows = useMemo(\n    () => filterProviderDirectoryRows(remoteRows, searchQuery),\n    [remoteRows, searchQuery],\n  );\n\n  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);''',
    "LibraryPage remote loader",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const displayRows = useMemo(() => {\n    if (!searchActive) return items;\n    return collectDatasetDescendants(tree, folderId);\n  }, [folderId, items, searchActive, tree]);\n  const visibleRows = useMemo(\n    () =>\n      sortItems(\n        displayRows.filter(''',
    '''  const displayRows = useMemo(() => {\n    if (remoteActive) return searchedRemoteRows;\n    if (!searchActive) return items;\n    return collectDatasetDescendants(tree, folderId);\n  }, [folderId, items, remoteActive, searchActive, searchedRemoteRows, tree]);\n  const visibleRows = useMemo(\n    () =>\n      sortItems(\n        displayRows.filter(''',
    "LibraryPage remote display rows",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const currentFolderName = isRoot ? "Library root" : trail[trail.length - 1]?.name || "Library";''',
    '''  const activeTrail = remoteActive ? remoteDirectory.trail : trail;\n  const currentFolderName = remoteActive\n    ? activeTrail[activeTrail.length - 1]?.name || providerLocation?.label || "Connected storage"\n    : isRoot ? "Library root" : trail[trail.length - 1]?.name || "Library";''',
    "LibraryPage active trail",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const branchDatasetRows = useMemo(() => {\n    if (searchActive) return displayRows.map(itemDataset);\n    if (isRoot) return vaultDatasets;\n    return collectDatasetDescendants(tree, folderId).map(itemDataset);\n  }, [displayRows, folderId, isRoot, searchActive, tree, vaultDatasets]);''',
    '''  const branchDatasetRows = useMemo(() => {\n    if (remoteActive) {\n      return remoteRows.filter((item) => item.kind === "dataset").map(itemDataset);\n    }\n    if (searchActive) return displayRows.map(itemDataset);\n    if (isRoot) return vaultDatasets;\n    return collectDatasetDescendants(tree, folderId).map(itemDataset);\n  }, [displayRows, folderId, isRoot, remoteActive, remoteRows, searchActive, tree, vaultDatasets]);''',
    "LibraryPage remote branch datasets",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const readyCount = readinessCount(branchDatasetRows);\n  const nonReadyCount = Math.max(0, branchDatasetRows.length - readyCount);\n  const attentionCount = branchDatasetRows.filter((row) => itemNeedsAttention(datasetListItem(row))).length;\n  const browseDatasetCount = branchDatasetRows.length;''',
    '''  const remoteFileCount = remoteActive ? remoteRows.filter((item) => item.kind !== "folder").length : 0;\n  const readyCount = readinessCount(branchDatasetRows);\n  const browseDatasetCount = remoteActive ? remoteFileCount : branchDatasetRows.length;\n  const nonReadyCount = Math.max(0, browseDatasetCount - readyCount);\n  const attentionCount = remoteActive\n    ? remoteRows.filter((item) => item.kind === "remote_file" || (item.kind === "dataset" && itemNeedsAttention(item))).length\n    : branchDatasetRows.filter((row) => itemNeedsAttention(datasetListItem(row))).length;''',
    "LibraryPage remote counts",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const branchNote = branchStatusNote({\n    isRoot,\n    items,\n    showingBranchFallback,\n    showingSearchHits,\n    displayCount: isRoot ? estateRows.length : displayRows.length,\n    folderCount,\n    partitionCount,\n    datasetCount: browseDatasetCount,\n  });''',
    '''  const branchNote = remoteActive\n    ? remoteDirectory.error\n      ? "Connected directory could not be read"\n      : remoteDirectory.loading\n        ? `Reading ${providerLocation?.label || "connected storage"}…`\n        : `${folderCount} folder${folderCount === 1 ? "" : "s"} · ${browseDatasetCount} file${browseDatasetCount === 1 ? "" : "s"} · known evidence opens its canonical Library dossier`\n    : branchStatusNote({\n        isRoot,\n        items,\n        showingBranchFallback,\n        showingSearchHits,\n        displayCount: isRoot ? estateRows.length : displayRows.length,\n        folderCount,\n        partitionCount,\n        datasetCount: browseDatasetCount,\n      });''',
    "LibraryPage remote branch note",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''        trail,\n        destination,''',
    '''        trail: activeTrail,\n        destination: remoteActive ? folderDestination(activeTrail, LIBRARY_FOLDERS_ROOT) : destination,''',
    "LibraryPage branch object remote trail",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''    [branchNote, browseDatasetCount, destination, estateRows.length, folderCount, folderId, isRoot, readyCount, referenceCount, trail, visibleRows.length],''',
    '''    [activeTrail, branchNote, browseDatasetCount, destination, estateRows.length, folderCount, folderId, isRoot, readyCount, referenceCount, remoteActive, visibleRows.length],''',
    "LibraryPage branch object deps",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const handleRefresh = useCallback(() => {\n    onRefresh?.();\n  }, [onRefresh]);''',
    '''  const handleRefresh = useCallback(() => {\n    if (remoteActive && remoteDirectory.providerId) {\n      loadRemoteDirectory({\n        providerId: remoteDirectory.providerId,\n        parentId: remoteDirectory.parentId,\n        trail: remoteDirectory.trail,\n      });\n      return;\n    }\n    onRefresh?.();\n  }, [loadRemoteDirectory, onRefresh, remoteActive, remoteDirectory.parentId, remoteDirectory.providerId, remoteDirectory.trail]);\n\n  const handleLocationChange = useCallback((nextLocation) => {\n    setLocationMode(nextLocation);\n    onFolderLocationChange?.(nextLocation);\n    if (nextLocation === "all") {\n      resetRemoteDirectory();\n      return;\n    }\n    const location = normalizedFolderLocations.find((item) => item.id === nextLocation);\n    if (!isBrowsableLibraryLocation(location, Boolean(loadFolderLocationDirectory))) return;\n    const providerTrail = [\n      { id: "", name: "Library" },\n      { id: LIBRARY_FOLDERS_ROOT, name: "Folders" },\n      { id: `provider:${nextLocation}`, name: location.label, remote: true, providerId: nextLocation, parentId: "" },\n    ];\n    loadRemoteDirectory({ providerId: nextLocation, parentId: "", trail: providerTrail });\n  }, [loadFolderLocationDirectory, loadRemoteDirectory, normalizedFolderLocations, onFolderLocationChange, resetRemoteDirectory]);\n\n  const handleBreadcrumbFolderChange = useCallback((nextFolderId) => {\n    if (remoteActive) {\n      setLocationMode("all");\n      onFolderLocationChange?.("all");\n      resetRemoteDirectory();\n    }\n    onFolderChange?.(nextFolderId);\n  }, [onFolderChange, onFolderLocationChange, remoteActive, resetRemoteDirectory]);\n\n  const handleRemoteBreadcrumb = useCallback((crumb) => {\n    const index = remoteDirectory.trail.findIndex((item) => item.id === crumb.id);\n    const nextTrail = index >= 0 ? remoteDirectory.trail.slice(0, index + 1) : remoteDirectory.trail;\n    loadRemoteDirectory({ providerId: crumb.providerId || locationMode, parentId: crumb.parentId || "", trail: nextTrail });\n  }, [loadRemoteDirectory, locationMode, remoteDirectory.trail]);\n\n  const handleOpenDirectoryFolder = useCallback((folder) => {\n    if (!remoteActive || !folder?.remoteProvider) {\n      onFolderChange?.(folder.id);\n      return;\n    }\n    const crumb = {\n      id: `provider:${folder.remoteProvider}:${folder.providerItemId}`,\n      name: folder.name,\n      remote: true,\n      providerId: folder.remoteProvider,\n      parentId: folder.providerItemId,\n    };\n    loadRemoteDirectory({\n      providerId: folder.remoteProvider,\n      parentId: folder.providerItemId,\n      trail: [...remoteDirectory.trail, crumb],\n    });\n  }, [loadRemoteDirectory, onFolderChange, remoteActive, remoteDirectory.trail]);\n\n  const loadMoreRemote = useCallback(() => {\n    if (!remoteActive || !remoteDirectory.hasMore || !remoteDirectory.nextCursor) return;\n    loadRemoteDirectory({\n      providerId: remoteDirectory.providerId,\n      parentId: remoteDirectory.parentId,\n      trail: remoteDirectory.trail,\n      cursor: remoteDirectory.nextCursor,\n      append: true,\n    });\n  }, [loadRemoteDirectory, remoteActive, remoteDirectory.hasMore, remoteDirectory.nextCursor, remoteDirectory.parentId, remoteDirectory.providerId, remoteDirectory.trail]);''',
    "LibraryPage remote handlers",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''            <LibraryBreadcrumb trail={trail} onFolderChange={onFolderChange} />''',
    '''            <LibraryBreadcrumb trail={activeTrail} onFolderChange={handleBreadcrumbFolderChange} onRemoteFolderChange={handleRemoteBreadcrumb} />''',
    "LibraryPage remote breadcrumb render",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''              onOpenUpload={openUploadRail}\n              onOpenUrlModal={openUrlRail}\n              onProcureBranch={handleProcureBranch}\n              onRefresh={onRefresh ? handleRefresh : undefined}''',
    '''              onOpenUpload={remoteActive ? undefined : openUploadRail}\n              onOpenUrlModal={remoteActive ? undefined : openUrlRail}\n              onProcureBranch={remoteActive ? undefined : handleProcureBranch}\n              onRefresh={onRefresh || remoteActive ? handleRefresh : undefined}''',
    "LibraryPage remote intake truth",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''                      setLocationMode(nextLocation);\n                      onFolderLocationChange?.(nextLocation);''',
    '''                      handleLocationChange(nextLocation);''',
    "LibraryPage location selection",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''                      const browsable = isBrowsableLibraryLocation(location, Boolean(onFolderLocationChange));''',
    '''                      const browsable = isBrowsableLibraryLocation(location, Boolean(loadFolderLocationDirectory));''',
    "LibraryPage location browsability",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''            data-navigation-state={navigationLoading ? "loading" : navigationError ? "error" : "ready"}''',
    '''            data-navigation-state={remoteActive ? (remoteDirectory.loading ? "loading" : remoteDirectory.error ? "error" : "ready") : navigationLoading ? "loading" : navigationError ? "error" : "ready"}''',
    "LibraryPage remote pathbar state",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''              {navigationLoading && !searchActive ? (\n                <span>Organizing collection…</span>\n              ) : (''',
    '''              {remoteActive && remoteDirectory.loading ? (\n                <span>Reading directory…</span>\n              ) : navigationLoading && !searchActive ? (\n                <span>Organizing collection…</span>\n              ) : (''',
    "LibraryPage remote path stats",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''            {navigationLoading && !searchActive ? (\n              <div className="rd-v2-library-empty" role="status" aria-live="polite">\n                <strong>Organizing collection…</strong>\n                <p>Reading the current research context before showing its holdings.</p>\n              </div>\n            ) : loading && !vaultDatasets.length ? (''',
    '''            {remoteActive && remoteDirectory.loading ? (\n              <div className="rd-v2-library-empty" role="status" aria-live="polite">\n                <strong>Reading {providerLocation?.label || "connected storage"}…</strong>\n                <p>Loading a bounded provider directory page; the underlying storage remains authoritative for its hierarchy.</p>\n              </div>\n            ) : remoteActive && remoteDirectory.error ? (\n              <DeskError raw={remoteDirectory.error} surface={providerLocation?.label || "connected storage"} />\n            ) : navigationLoading && !searchActive ? (\n              <div className="rd-v2-library-empty" role="status" aria-live="polite">\n                <strong>Organizing collection…</strong>\n                <p>Reading the current research context before showing its holdings.</p>\n              </div>\n            ) : loading && !vaultDatasets.length ? (''',
    "LibraryPage remote directory loading",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''                onOpenFolder={(folder) => onFolderChange(folder.id)}\n                onSelectDataset={onSelectDataset}\n                compact\n              />''',
    '''                onOpenFolder={handleOpenDirectoryFolder}\n                onSelectDataset={onSelectDataset}\n                compact\n                serverPaginated={remoteActive}\n                hasMore={remoteActive && remoteDirectory.hasMore}\n                loadingMore={remoteDirectory.loadingMore}\n                onLoadMore={remoteActive ? loadMoreRemote : undefined}\n              />''',
    "LibraryPage remote catalog",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''                  {searchActive\n                    ? "Try a broader keyword, or clear the search to see the current collection again."\n                    : "Clear the filter or use the breadcrumb to return to Library."}''',
    '''                  {searchActive\n                    ? "Try a broader keyword, or clear the search to see this directory again."\n                    : remoteActive\n                      ? "This connected directory page contains no visible entries. Use the breadcrumb or choose another Location."\n                      : "Clear the filter or use the breadcrumb to return to Library."}''',
    "LibraryPage remote empty copy",
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''                {!searchActive && (onStartUpload || onStartUrl || onStartProcure) ? (''',
    '''                {!remoteActive && !searchActive && (onStartUpload || onStartUrl || onStartProcure) ? (''',
    "LibraryPage remote empty actions",
)

# App: consume real connected-account truth and expose the provider-neutral
# directory loader. Library still owns no OAuth credentials.
replace_once(
    "drive/src/v2/App.jsx",
    '''import { composerRuntimeRead } from "@/v2/composerRuntimeStatus";''',
    '''import { composerRuntimeRead } from "@/v2/composerRuntimeStatus";\nimport { listConnectedAccounts } from "@/v2/connectedAccountsApi";\nimport { listLibraryProviderDirectory } from "@/v2/libraryFederationApi";\nimport { libraryLocationsFromAccountDocument } from "@/v2/libraryFederationRuntime";''',
    "App federation imports",
)
replace_once(
    "drive/src/v2/App.jsx",
    '''  const [libraryNavError, setLibraryNavError] = useState("");\n  const [ops, setOps] = useState(null);''',
    '''  const [libraryNavError, setLibraryNavError] = useState("");\n  const [libraryFolderLocations, setLibraryFolderLocations] = useState([]);\n  const [ops, setOps] = useState(null);''',
    "App federation state",
)
# Insert account-truth refresh before the held rows memo, a stable anchor late in App.
replace_once(
    "drive/src/v2/App.jsx",
    '''  const heldLibraryRows = useMemo(() => libraryHoldings(catalog || []), [catalog]);''',
    '''  const refreshLibraryFolderLocations = useCallback(async () => {\n    if (!deskAccess?.authenticated) {\n      setLibraryFolderLocations([]);\n      return [];\n    }\n    try {\n      const document = await listConnectedAccounts();\n      const locations = libraryLocationsFromAccountDocument(document);\n      setLibraryFolderLocations(locations);\n      return locations;\n    } catch {\n      setLibraryFolderLocations([]);\n      return [];\n    }\n  }, [deskAccess?.authenticated]);\n\n  useEffect(() => {\n    if (tab === "library") refreshLibraryFolderLocations();\n  }, [refreshLibraryFolderLocations, tab]);\n\n  const loadLibraryFolderLocationDirectory = useCallback(\n    (request) => listLibraryProviderDirectory(request),\n    [],\n  );\n\n  const heldLibraryRows = useMemo(() => libraryHoldings(catalog || []), [catalog]);''',
    "App account truth refresh",
)
replace_once(
    "drive/src/v2/App.jsx",
    '''          selectionHoldings={heldLibraryRows}\n          selectionFallback={isLocalHolding(detail) ? detail : null}\n        />''',
    '''          selectionHoldings={heldLibraryRows}\n          selectionFallback={isLocalHolding(detail) ? detail : null}\n          folderLocations={libraryFolderLocations}\n          loadFolderLocationDirectory={loadLibraryFolderLocationDirectory}\n        />''',
    "App Library federation props",
)

# Default browser fixture keeps providers visible but disconnected. Individual
# federation tests can override these routes after mockV2Api is installed.
replace_once(
    "e2e/fixtures/v2MockApi.js",
    '''export const MOCK_HEALTH = {''',
    '''export const MOCK_CONNECTED_ACCOUNTS = {\n  providers: [\n    { id: "google_drive", label: "Google Drive", configured: true, rclone_available: true, directory_browse_available: false },\n    { id: "dropbox", label: "Dropbox", configured: true, rclone_available: true, directory_browse_available: false },\n  ],\n  accounts: [],\n};\n\nexport const MOCK_HEALTH = {''',
    "mock connected accounts constant",
)
replace_once(
    "e2e/fixtures/v2MockApi.js",
    '''  await page.route("**/library/ops*", (route) =>''',
    '''  await page.route("**/library/accounts", (route) =>\n    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CONNECTED_ACCOUNTS) }),\n  );\n  await page.route("**/library/ops*", (route) =>''',
    "mock connected accounts route",
)

write("e2e/library-federation-runtime.spec.js", r'''
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";

const OUT = "artifacts/library-federation-runtime";

function accountDocument() {
  return {
    providers: [
      { id: "google_drive", label: "Google Drive", configured: true, rclone_available: true, directory_browse_available: true },
      { id: "dropbox", label: "Dropbox", configured: true, rclone_available: true, directory_browse_available: false },
    ],
    accounts: [
      { id: "acct-gdrive", provider: "google_drive", email: "prof@example.edu", access_mode: "read", verified_at: "2026-09-04T12:00:00Z" },
    ],
  };
}

function directoryPayload(url) {
  const parent = url.searchParams.get("parent_id") || "";
  const cursor = url.searchParams.get("cursor") || "";
  if (!parent && cursor === "page-2") {
    return {
      items: [
        { id: "shared", kind: "folder", name: "Shared with me", path: "Google Drive / Shared with me", child_count: 3, content_access: "available" },
      ],
      next_cursor: "",
      has_more: false,
    };
  }
  if (!parent) {
    return {
      items: [
        { id: "my-drive", kind: "folder", name: "My Drive", path: "Google Drive / My Drive", child_count: 2, content_access: "available" },
        { id: "known-gdelt", kind: "file", name: "gdelt_asia_daily.csv", logical_asset_id: "gdelt_asia_daily_country_panel", path: "Google Drive / My Drive / Research / gdelt_asia_daily.csv", content_access: "available" },
        { id: "forgotten", kind: "file", name: "forgotten_survey.csv", path: "Google Drive / My Drive / Archive / forgotten_survey.csv", content_access: "available", mime_type: "text/csv" },
      ],
      next_cursor: "page-2",
      has_more: true,
    };
  }
  if (parent === "my-drive") {
    return {
      items: [
        { id: "research", kind: "folder", name: "Research projects", parent_id: "my-drive", path: "Google Drive / My Drive / Research projects", child_count: 1, content_access: "available" },
        { id: "issuer", kind: "file", name: "issuer_weekly.parquet", parent_id: "my-drive", logical_asset_id: "issuer_weekly_panel", path: "Google Drive / My Drive / issuer_weekly.parquet", content_access: "available" },
      ],
      next_cursor: "",
      has_more: false,
    };
  }
  return { items: [], next_cursor: "", has_more: false };
}

test("connected Google Drive lazily browses provider folders and converges known files on canonical dossiers", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockV2Api(page);
  await page.route("**/library/accounts", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(accountDocument()) }),
  );
  await page.route("**/library/folders?*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(directoryPayload(url)) });
  });

  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await page.getByTestId("library-folders-root").click();

  const location = page.getByTestId("library-location-filter");
  await expect(location).toBeVisible();
  await expect(location.locator('option[value="google_drive"]')).not.toHaveAttribute("disabled", "");
  await expect(location.locator('option[value="dropbox"]')).toHaveAttribute("disabled", "");
  await location.selectOption("google_drive");

  await expect(page.getByText("My Drive", { exact: true })).toBeVisible();
  await expect(page.getByText("Asia daily news-risk panel", { exact: true })).toBeVisible();
  await expect(page.getByText("forgotten_survey.csv", { exact: true })).toBeVisible();
  await expect(page.getByText("Not in Library", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Google Drive");
  await page.screenshot({ path: `${OUT}/01-google-drive-root-1440.png`, fullPage: false });

  await page.getByRole("button", { name: /My Drive/ }).click();
  await expect(page.getByText("Research projects", { exact: true })).toBeVisible();
  await expect(page.getByText("Issuer weekly fundamentals", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("My Drive");
  await page.screenshot({ path: `${OUT}/02-google-drive-my-drive-1440.png`, fullPage: false });

  await page.getByText("Issuer weekly fundamentals", { exact: true }).click();
  await expect(page.getByTestId("library-asset-inspector")).toBeVisible();
  await expect(page.getByTestId("library-asset-inspector")).toContainText("Issuer weekly fundamentals");

  await page.getByRole("button", { name: /Close|Back/i }).first().click().catch(() => {});
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(location).toHaveValue("google_drive");
  await page.screenshot({ path: `${OUT}/03-google-drive-mobile.png`, fullPage: false });
});
''')

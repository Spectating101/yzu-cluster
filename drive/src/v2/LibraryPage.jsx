import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DRIVE_LAB,
  buildConsumerDriveTree,
  breadcrumbTrail,
  consumerDatasetPath,
  listFolderChildren,
} from "@/driveTree";
import { libraryFolderObject } from "@/v2/activeObject";
import { AssetWorkspace } from "@/v2/AssetWorkspace";
import { CatalogList } from "@/v2/CatalogList";
import { statusPillKind } from "@/v2/datasetMeta";
import {
  libraryUploadCapability,
  libraryUrlIntakeCapability,
} from "@/v2/libraryIntakeCapability";
import { Chip, PageShell } from "@/v2/ui";

function datasetListItem(row) {
  return {
    kind: "dataset",
    id: row.dataset_id,
    name: row.name,
    row,
  };
}

function normalizedPath(value) {
  return String(value || "")
    .replace(/^data_lake\//, "")
    .replace(/^\/+|\/+$/g, "");
}

function datasetMatchesFolder(row, folderId) {
  const folder = normalizedPath(folderId);
  if (!folder) return false;
  const treePath = consumerDatasetPath(row, DRIVE_LAB).join("/");
  const rawPath = normalizedPath(row.local_path || row.local_root);
  if (treePath === folder || treePath.startsWith(`${folder}/`)) return true;
  if (rawPath === folder || rawPath.startsWith(`${folder}/`)) return true;

  const leaf = folder.split("/").filter(Boolean).pop()?.toLowerCase();
  if (!leaf || leaf.length < 3) return false;
  const hay = [
    row.dataset_id,
    row.name,
    row.source,
    row.publisher,
    row.backend,
    row.domain,
    row.local_root,
    row.local_path,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(leaf);
}

function readinessCount(rows) {
  return rows.filter((d) => statusPillKind(d).kind === "query-ready").length;
}

function itemDataset(item) {
  return item?.row || item;
}

function itemName(item) {
  if (item?.kind === "folder") return item.name || "";
  const row = itemDataset(item);
  return row.name || row.title || row.dataset_id || "";
}

function itemUpdatedTime(item) {
  const row = itemDataset(item);
  const raw = row.updated_at || row.last_modified || row.as_of;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function itemMatchesFilter(item, mode) {
  if (mode === "all" || item?.kind === "folder") return true;
  const row = itemDataset(item);
  return statusPillKind(row).kind === "query-ready";
}

function sortItems(rows, sortBy) {
  return [...rows].sort((a, b) => {
    if (a?.kind === "folder" && b?.kind !== "folder") return -1;
    if (a?.kind !== "folder" && b?.kind === "folder") return 1;
    if (sortBy === "updated") {
      const delta = itemUpdatedTime(b) - itemUpdatedTime(a);
      if (delta) return delta;
    }
    return itemName(a).localeCompare(itemName(b), undefined, { sensitivity: "base" });
  });
}

function folderDestination(trail, folderId) {
  if (!folderId) return "Lab root";
  return trail.map((c) => c.name).join(" / ");
}

function branchStatusNote({ isRoot, items, showingBranchFallback, displayCount, folderCount, datasetCount }) {
  if (!displayCount) {
    return isRoot ? "No indexed folders yet" : "No holdings in this branch";
  }
  if (showingBranchFallback) {
    return `${displayCount} dataset${displayCount === 1 ? "" : "s"} matched here`;
  }
  if (items.length) {
    const parts = [];
    if (folderCount) parts.push(`${folderCount} folder${folderCount === 1 ? "" : "s"}`);
    if (datasetCount) parts.push(`${datasetCount} dataset${datasetCount === 1 ? "" : "s"}`);
    return parts.join(", ") || `${displayCount} item${displayCount === 1 ? "" : "s"}`;
  }
  return `${displayCount} item${displayCount === 1 ? "" : "s"} in branch`;
}

function LibraryBreadcrumb({ trail, onFolderChange }) {
  return (
    <nav className="rd-v2-breadcrumb rd-v2-crumb" aria-label="Breadcrumb">
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={c.id || "root"} className="rd-v2-crumb-item">
            {i > 0 ? <span className="sep">›</span> : null}
            {last ? (
              <span className="here">{c.name}</span>
            ) : (
              <button type="button" onClick={() => onFolderChange(c.id)}>
                {c.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function LibraryNewMenu({
  open,
  onToggle,
  onUploadFile,
  onAddUrl,
  onProcure,
  onClose,
  uploadAvailable,
  uploadLabel,
  urlLabel,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  return (
    <div className="rd-v2-library-action-wrap" ref={menuRef}>
      <button
        type="button"
        className="rd-v2-btn sm rd-v2-library-action-btn primary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open new library item menu"
        onClick={onToggle}
      >
        New ▾
      </button>
      {open ? (
        <div className="rd-v2-library-action-menu" role="menu" aria-label="New library item">
          <button
            type="button"
            role="menuitem"
            className="rd-v2-library-menu-item"
            disabled={!uploadAvailable}
            aria-disabled={!uploadAvailable}
            title={uploadAvailable ? undefined : "Server staging not reported"}
            onClick={uploadAvailable ? onUploadFile : undefined}
          >
            {uploadLabel}
          </button>
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onAddUrl}>
            {urlLabel}
          </button>
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onProcure}>
            Procure missing data...
          </button>
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" disabled>
            New folder
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LibraryHeadActions({
  newMenuOpen,
  onToggleNewMenu,
  onCloseNewMenu,
  onOpenUpload,
  onOpenUrlModal,
  onProcureBranch,
  onRefresh,
  uploadAvailable,
  uploadLabel,
  urlLabel,
}) {
  return (
    <div className="rd-v2-library-actions">
      <LibraryNewMenu
        open={newMenuOpen}
        onToggle={onToggleNewMenu}
        onClose={onCloseNewMenu}
        onUploadFile={onOpenUpload}
        onAddUrl={onOpenUrlModal}
        onProcure={onProcureBranch}
        uploadAvailable={uploadAvailable}
        uploadLabel={uploadLabel}
        urlLabel={urlLabel}
      />
      <button
        type="button"
        className="rd-v2-btn sm rd-v2-library-action-btn ghost"
        onClick={onRefresh}
        disabled={!onRefresh}
      >
        Refresh
      </button>
    </div>
  );
}

export function LibraryPage({
  datasets,
  partitions = [],
  cluster,
  folderId,
  onFolderChange,
  selectedId,
  selectedDataset = null,
  onSelectDataset,
  onClearSelection,
  onPreviewDataset,
  onRefresh,
  onFocusFolder,
  onStartUpload,
  onStartUrl,
  onStartProcure,
  resourcesRollup = null,
}) {
  const [sortBy, setSortBy] = useState("name");
  const [filterMode, setFilterMode] = useState("all");
  const [partitionFilter, setPartitionFilter] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  const uploadCap = useMemo(() => libraryUploadCapability(resourcesRollup), [resourcesRollup]);
  const urlCap = useMemo(() => libraryUrlIntakeCapability(), []);

  const scopedDatasets = useMemo(() => {
    if (!partitionFilter) return datasets;
    const lane = (partitions.length ? partitions : cluster?.lanes || []).find((row) => row.id === partitionFilter);
    if (!lane) return datasets;
    const ids = new Set(lane.detail?.registry_dataset_ids || []);
    const partitionId = String((lane.detail || {}).partition_id || "").replace(/^partition_/, "").replace(/_/g, ".");
    return datasets.filter((row) => {
      if (ids.has(row.dataset_id)) return true;
      const pid = String(row.partition_id || row.collection?.partition_id || "");
      return partitionId && pid === partitionId;
    });
  }, [cluster?.lanes, datasets, partitionFilter, partitions]);

  const tree = useMemo(
    () => buildConsumerDriveTree(scopedDatasets, { scope: DRIVE_LAB }),
    [scopedDatasets],
  );

  const trail = useMemo(() => {
    const crumbs = breadcrumbTrail(tree, folderId);
    if (crumbs[0]) crumbs[0].name = "Lab";
    return crumbs;
  }, [tree, folderId]);

  const destination = useMemo(() => folderDestination(trail, folderId), [trail, folderId]);
  const isRoot = !folderId;

  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);
  const branchRows = useMemo(
    () => scopedDatasets.filter((row) => datasetMatchesFolder(row, folderId)).map(datasetListItem),
    [scopedDatasets, folderId],
  );
  const displayRows = useMemo(() => {
    if (items.length) return items;
    return branchRows;
  }, [items, branchRows]);
  const visibleRows = useMemo(
    () => sortItems(displayRows.filter((item) => itemMatchesFilter(item, filterMode)), sortBy),
    [displayRows, filterMode, sortBy],
  );
  const currentFolderName = isRoot ? "Lab root" : trail[trail.length - 1]?.name || "Lab";
  const showingBranchFallback = !items.length && branchRows.length > 0;
  const branchDatasetRows = useMemo(
    () => (isRoot ? scopedDatasets : branchRows.map(itemDataset)),
    [branchRows, scopedDatasets, isRoot],
  );
  const readyCount = readinessCount(branchDatasetRows);
  const folderCount = visibleRows.filter((item) => item.kind === "folder").length;
  const datasetCount = branchDatasetRows.length;
  const branchNote = branchStatusNote({
    isRoot,
    items,
    showingBranchFallback,
    displayCount: displayRows.length,
    folderCount,
    datasetCount,
  });
  const branchObject = useMemo(
    () =>
      libraryFolderObject({
        folderId,
        trail,
        destination,
        note: branchNote,
        folderCount,
        datasetCount,
        readyCount,
        itemCount: visibleRows.length,
      }),
    [branchNote, datasetCount, destination, folderCount, folderId, readyCount, trail, visibleRows.length],
  );

  const workspaceDataset = useMemo(() => {
    if (!selectedId) return null;
    return (
      selectedDataset ||
      datasets.find((row) => row.dataset_id === selectedId) ||
      null
    );
  }, [datasets, selectedDataset, selectedId]);

  useEffect(() => {
    if (!selectedId) onFocusFolder?.(branchObject);
  }, [branchObject, onFocusFolder, selectedId]);

  const closeNewMenu = useCallback(() => setNewMenuOpen(false), []);
  const toggleNewMenu = useCallback(() => setNewMenuOpen((open) => !open), []);

  const openUploadRail = useCallback(() => {
    if (!uploadCap.uploadAvailable) return;
    setNewMenuOpen(false);
    onStartUpload?.(branchObject);
  }, [branchObject, onStartUpload, uploadCap.uploadAvailable]);

  const openUrlRail = useCallback(() => {
    setNewMenuOpen(false);
    onStartUrl?.(branchObject);
  }, [branchObject, onStartUrl]);

  const handleRefresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleProcureBranch = useCallback(() => {
    setNewMenuOpen(false);
    onStartProcure?.(branchObject);
  }, [branchObject, onStartProcure]);

  const showWorkspace = Boolean(workspaceDataset);

  return (
    <PageShell
      className="rd-v2-library-page"
      title="Library"
      lead="Faculty vault, query readiness, and procurement memory."
      headExtra={
        <div className="rd-v2-library-headline">
          <LibraryBreadcrumb trail={trail} onFolderChange={onFolderChange} />
          <LibraryHeadActions
            newMenuOpen={newMenuOpen}
            onToggleNewMenu={toggleNewMenu}
            onCloseNewMenu={closeNewMenu}
            onOpenUpload={openUploadRail}
            onOpenUrlModal={openUrlRail}
            onProcureBranch={handleProcureBranch}
            onRefresh={onRefresh ? handleRefresh : undefined}
            uploadAvailable={uploadCap.uploadAvailable}
            uploadLabel={uploadCap.uploadLabel}
            urlLabel={urlCap.label}
          />
        </div>
      }
      toolbar={
        showWorkspace ? null : (
          <>
            <Chip active={sortBy === "name"} onClick={() => setSortBy("name")}>
              Name {sortBy === "name" ? "↑" : "↕"}
            </Chip>
            <Chip active={sortBy === "updated"} onClick={() => setSortBy("updated")}>
              Last modified {sortBy === "updated" ? "↓" : "↕"}
            </Chip>
            <Chip
              active={filterMode === "ready"}
              onClick={() => setFilterMode((cur) => (cur === "ready" ? "all" : "ready"))}
            >
              Filter: {filterMode === "ready" ? "Query-ready" : "All"}
            </Chip>
            <span className="rd-v2-toolbar-spacer" />
            <span className="rd-v2-toolbar-count">
              {visibleRows.length} {visibleRows.length === 1 ? "item" : "items"}
            </span>
          </>
        )
      }
      footer={showWorkspace ? null : "double-click row → Preview"}
    >
      {showWorkspace ? (
        <AssetWorkspace
          dataset={workspaceDataset}
          onClearSelection={onClearSelection}
          onPreview={onPreviewDataset}
        />
      ) : (
        <>
          <div className="rd-v2-library-branchline rd-v2-library-pathbar" aria-label="Library location status">
            <div className="rd-v2-library-pathcopy">
              <strong>{currentFolderName}</strong>
              <p>
                {isRoot
                  ? "Browse the lab’s working data vault. Select a dataset for the Asset Workspace; Detail stays on the rail."
                  : branchNote}
              </p>
              {!uploadCap.uploadAvailable ? (
                <p className="rd-v2-library-capability-note" role="status">
                  {uploadCap.uploadHint}
                </p>
              ) : null}
            </div>
            <div className="rd-v2-library-pathstats">
              <span>
                {folderCount} folder{folderCount === 1 ? "" : "s"}
              </span>
              <span>
                {datasetCount} dataset{datasetCount === 1 ? "" : "s"}
              </span>
              <span>
                {readyCount} query-ready
              </span>
            </div>
          </div>
          <div className="rd-v2-catalog-list-wrap">
            {visibleRows.length ? (
              <CatalogList
                rows={visibleRows}
                selectedId={selectedId}
                onOpenFolder={(folder) => onFolderChange(folder.id)}
                onSelectDataset={onSelectDataset}
                onDoubleClick={onPreviewDataset}
                compact
              />
            ) : (
              <div className="rd-v2-library-empty">
                <strong>No holdings in this branch</strong>
                <p>Clear the filter or open the Lab breadcrumb to return to indexed folders.</p>
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}

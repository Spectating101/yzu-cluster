import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  breadcrumbTrail,
  collectDatasetDescendants,
  listFolderChildren,
} from "@/driveTree";
import { buildProfessorVaultTree, datasetTitle, isOpsNoiseDataset } from "@/v2/professorVaultTree";
import { libraryFolderObject } from "@/v2/activeObject";
import { CatalogList } from "@/v2/CatalogList";
import { statusPillKind } from "@/v2/datasetMeta";
import { LibraryAssetWorkspace } from "@/v2/LibraryAssetWorkspace";
import { LibraryEvidenceEstate } from "@/v2/LibraryEvidenceEstate";
import { resolveLibrarySelection } from "@/v2/librarySelection";
import { buildLibrarySearchAskPrompt, rankLibraryHoldings } from "@/v2/librarySearch";
import { Chip, PageShell } from "@/v2/ui";
import { DeskError } from "@/v2/DeskError";
import { resolveSurfaceLifecycle } from "@/v2/surfaceLifecycle";

function datasetListItem(row) {
  const name = datasetTitle(row);
  return {
    kind: "dataset",
    id: row.dataset_id,
    name,
    row: { ...row, name },
  };
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
  const ready = statusPillKind(row).kind === "query-ready";
  if (mode === "ready") return ready;
  if (mode === "not_ready") return !ready;
  return true;
}

function sortItems(rows, sortBy) {
  return [...rows].sort((a, b) => {
    if (a?.kind === "folder" && b?.kind !== "folder") return -1;
    if (a?.kind !== "folder" && b?.kind === "folder") return 1;
    if (sortBy === "relevance") {
      const delta = Number(itemDataset(b).search_match?.score || 0) - Number(itemDataset(a).search_match?.score || 0);
      if (delta) return delta;
    }
    if (sortBy === "updated") {
      const delta = itemUpdatedTime(b) - itemUpdatedTime(a);
      if (delta) return delta;
    }
    return itemName(a).localeCompare(itemName(b), undefined, { sensitivity: "base" });
  });
}

function folderDestination(trail, folderId) {
  if (!folderId) return "Library root";
  return trail.map((c) => c.name).join(" / ");
}

function branchStatusNote({
  isRoot,
  items,
  showingBranchFallback,
  showingSearchHits,
  displayCount,
  folderCount,
  partitionCount,
  datasetCount,
}) {
  if (!displayCount && !folderCount) {
    if (showingSearchHits) return "No assets match this search";
    return isRoot ? "No registered evidence yet" : "No holdings in this branch";
  }
  if (showingSearchHits) {
    return `${displayCount} matching asset${displayCount === 1 ? "" : "s"} — select one for readiness, source, preview, and Ask`;
  }
  if (showingBranchFallback) {
    return `${displayCount} asset${displayCount === 1 ? "" : "s"} matched here`;
  }
  if (isRoot) {
    const parts = [];
    if (datasetCount) parts.push(`${datasetCount} evidence asset${datasetCount === 1 ? "" : "s"}`);
    if (folderCount) parts.push(`${folderCount} research collection${folderCount === 1 ? "" : "s"}`);
    if (partitionCount) parts.push(`${partitionCount} nested context${partitionCount === 1 ? "" : "s"}`);
    return parts.join(" · ") || "Browse the registered evidence estate";
  }
  if (items.length) {
    const parts = [];
    if (folderCount) parts.push(`${folderCount} folder${folderCount === 1 ? "" : "s"}`);
    if (datasetCount) parts.push(`${datasetCount} asset${datasetCount === 1 ? "" : "s"}`);
    return parts.join(" · ") || "Open a folder or evidence asset";
  }
  return "No holdings in this branch";
}

function toolbarCountLabel({ searchActive, isRoot, folderCount, datasetCount, visibleCount }) {
  if (searchActive) {
    return `${visibleCount} asset${visibleCount === 1 ? "" : "s"}`;
  }
  if (isRoot) {
    const parts = [];
    if (datasetCount) parts.push(`${datasetCount} asset${datasetCount === 1 ? "" : "s"}`);
    if (folderCount) parts.push(`${folderCount} collection${folderCount === 1 ? "" : "s"}`);
    return parts.join(" · ") || `${visibleCount} row${visibleCount === 1 ? "" : "s"}`;
  }
  const parts = [];
  if (folderCount) parts.push(`${folderCount} ${folderCount === 1 ? "folder" : "folders"}`);
  if (datasetCount) parts.push(`${datasetCount} ${datasetCount === 1 ? "asset" : "assets"}`);
  return parts.join(" · ") || `${visibleCount} row${visibleCount === 1 ? "" : "s"}`;
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

function LibraryNewMenu({ open, onToggle, onUploadFile, onAddUrl, onProcure, onClose }) {
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
          {onUploadFile ? <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onUploadFile}>Upload file...</button> : null}
          {onAddUrl ? <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onAddUrl}>Add URL / DOI...</button> : null}
          {onProcure ? <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onProcure}>Procure missing data...</button> : null}
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" disabled>
            New collection
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
}) {
  const canIntake = Boolean(onOpenUpload || onOpenUrlModal || onProcureBranch);
  return (
    <div className="rd-v2-library-actions">
      {canIntake ? <LibraryNewMenu
        open={newMenuOpen}
        onToggle={onToggleNewMenu}
        onClose={onCloseNewMenu}
        onUploadFile={onOpenUpload}
        onAddUrl={onOpenUrlModal}
        onProcure={onProcureBranch}
      /> : null}
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

function LibraryAssetInspector({ dataset, onClose, onPreview, onOpenQuery, onAsk }) {
  const inspectorRef = useRef(null);

  useEffect(() => {
    if (!dataset) return undefined;
    const frame = window.requestAnimationFrame(() => inspectorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [dataset]);

  if (!dataset) return null;

  return (
    <div
      className="rd-v2-library-inspector-scrim"
      data-testid="library-asset-inspector"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (event.target.closest?.(".rd-v2-library-overlay")) return;
        event.stopPropagation();
        onClose?.();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={inspectorRef}
        className="rd-v2-library-inspector-shell"
        role="dialog"
        aria-label={`Inspect ${datasetTitle(dataset)}`}
        tabIndex={-1}
      >
        <LibraryAssetWorkspace
          dataset={dataset}
          onBack={onClose}
          onPreview={onPreview}
          onAsk={onAsk}
          onOpenQuery={onOpenQuery}
        />
      </section>
    </div>
  );
}

export function LibraryPage({
  datasets,
  loading = false,
  navigationLoading = false,
  navigationError = "",
  partitions = [],
  shelves = [],
  loadError = "",
  guide = null,
  folderId,
  onFolderChange,
  selectedId,
  onSelectDataset,
  onPreviewDataset,
  onOpenQuery,
  onRefresh,
  onFocusFolder,
  onStartUpload,
  onStartUrl,
  onStartProcure,
  onClearSelection,
  onAskDataset,
  onAskSearch,
  searchQuery = "",
  onSearchChange,
  selectionHoldings,
  selectionFallback,
  referenceCount = 0,
}) {
  const [sortBy, setSortBy] = useState("name");
  const [filterMode, setFilterMode] = useState("all");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const searchActive = Boolean(String(searchQuery || "").trim());

  const librarySearchNav = useMemo(() => {
    const byDataset = new Map();
    const shelfById = new Map((shelves || []).map((shelf) => [String(shelf.id || ""), shelf]));
    for (const lane of partitions || []) {
      const shelf = shelfById.get(String(lane.shelf_id || ""));
      const nav = [
        shelf?.label,
        shelf?.blurb,
        lane.professor_label,
        lane.subtitle,
        lane.name,
        lane.professor_blurb,
        lane.scope,
        lane.partition_id,
        lane.detail?.partition_id,
      ]
        .filter(Boolean)
        .join(" ");
      const ids = lane.detail?.registry_dataset_ids || lane.registry_dataset_ids || [];
      for (const id of ids) {
        const key = String(id || "");
        if (!key) continue;
        byDataset.set(key, `${byDataset.get(key) || ""} ${nav}`.trim());
      }
    }
    return byDataset;
  }, [partitions, shelves]);

  const allHeldDatasets = useMemo(
    () => (selectionHoldings || datasets || []).filter((row) => !isOpsNoiseDataset(row)),
    [datasets, selectionHoldings],
  );
  const rankedSearchDatasets = useMemo(
    () => (searchActive ? rankLibraryHoldings(allHeldDatasets, searchQuery, librarySearchNav) : []),
    [allHeldDatasets, librarySearchNav, searchActive, searchQuery],
  );
  const vaultDatasets = useMemo(
    () => (searchActive ? rankedSearchDatasets : (datasets || []).filter((row) => !isOpsNoiseDataset(row))),
    [datasets, rankedSearchDatasets, searchActive],
  );

  useEffect(() => {
    if (searchActive) {
      setSortBy((current) => (current === "name" ? "relevance" : current));
    } else {
      setSortBy((current) => (current === "relevance" ? "name" : current));
    }
  }, [searchActive]);
  const surfaceState = resolveSurfaceLifecycle({
    loading: loading || navigationLoading,
    error: loadError || navigationError,
    count: vaultDatasets.length,
  });
  const selectedDataset = useMemo(
    () =>
      resolveLibrarySelection({
        selectedId,
        holdings: selectionHoldings || vaultDatasets,
        fallback: selectionFallback,
        allowUnknown: loading,
      }),
    [loading, selectedId, selectionHoldings, selectionFallback, vaultDatasets],
  );

  const tree = useMemo(
    () => buildProfessorVaultTree(vaultDatasets, partitions, shelves),
    [vaultDatasets, partitions, shelves],
  );

  const trail = useMemo(() => {
    const crumbs = breadcrumbTrail(tree, folderId);
    if (crumbs[0]) crumbs[0].name = "Library";
    return crumbs;
  }, [tree, folderId]);

  const destination = useMemo(() => folderDestination(trail, folderId), [trail, folderId]);
  const isRoot = !folderId;

  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);
  // Search already filters the catalog upstream; without flattening, Library root
  // would expose only ancestor shelves instead of the matching evidence itself.
  const displayRows = useMemo(() => {
    if (!searchActive) return items;
    return collectDatasetDescendants(tree, folderId);
  }, [folderId, items, searchActive, tree]);
  const visibleRows = useMemo(
    () => sortItems(displayRows.filter((item) => itemMatchesFilter(item, filterMode)), sortBy),
    [displayRows, filterMode, sortBy],
  );
  const currentFolderName = isRoot ? "Library root" : trail[trail.length - 1]?.name || "Library";
  const showingBranchFallback = false;
  const showingSearchHits = searchActive;
  const folderRows = useMemo(
    () => visibleRows.filter((item) => item.kind === "folder"),
    [visibleRows],
  );
  const folderCount = folderRows.length;
  const partitionCount = useMemo(() => {
    if (!isRoot || searchActive) return 0;
    return folderRows.reduce(
      (sum, shelf) =>
        sum + Object.values(shelf.children || {}).filter((c) => c?.kind === "folder").length,
      0,
    );
  }, [folderRows, isRoot, searchActive]);
  const branchDatasetRows = useMemo(() => {
    if (searchActive) return displayRows.map(itemDataset);
    if (isRoot) return vaultDatasets;
    return collectDatasetDescendants(tree, folderId).map(itemDataset);
  }, [displayRows, folderId, isRoot, searchActive, tree, vaultDatasets]);
  const estateRows = useMemo(
    () => sortItems(branchDatasetRows.map(datasetListItem).filter((item) => itemMatchesFilter(item, filterMode)), sortBy),
    [branchDatasetRows, filterMode, sortBy],
  );
  const rootCollections = useMemo(
    () => folderRows.map((folder) => ({
      ...folder,
      asset_count: collectDatasetDescendants(tree, folder.id).length,
    })),
    [folderRows, tree],
  );
  const readyCount = readinessCount(branchDatasetRows);
  const nonReadyCount = Math.max(0, branchDatasetRows.length - readyCount);
  const browseDatasetCount = branchDatasetRows.length;
  const branchNote = branchStatusNote({
    isRoot,
    items,
    showingBranchFallback,
    showingSearchHits,
    displayCount: isRoot ? estateRows.length : displayRows.length,
    folderCount,
    partitionCount,
    datasetCount: browseDatasetCount,
  });
  // Keep guide in the contract for the backend-owned taxonomy. Root evidence is
  // no longer gated by those recommendations; shelves remain contextual filters.
  void guide;
  const branchObject = useMemo(
    () =>
      libraryFolderObject({
        folderId,
        trail,
        destination,
        note: branchNote,
        folderCount,
        datasetCount: browseDatasetCount,
        readyCount,
        itemCount: isRoot ? estateRows.length : visibleRows.length,
        referenceCount: isRoot ? referenceCount : 0,
      }),
    [branchNote, browseDatasetCount, destination, estateRows.length, folderCount, folderId, isRoot, readyCount, referenceCount, trail, visibleRows.length],
  );

  useEffect(() => {
    if (!selectedId) onFocusFolder?.(branchObject);
  }, [branchObject, onFocusFolder, selectedId]);

  const closeNewMenu = useCallback(() => setNewMenuOpen(false), []);
  const toggleNewMenu = useCallback(() => setNewMenuOpen((open) => !open), []);

  const openUploadRail = useCallback(() => {
    setNewMenuOpen(false);
    onStartUpload?.(branchObject);
  }, [branchObject, onStartUpload]);

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

  const askCurrentSearch = useCallback(() => {
    const query = String(searchQuery || "").trim();
    if (!query || !onAskSearch) return;
    onClearSelection?.();
    onAskSearch(buildLibrarySearchAskPrompt(query, branchDatasetRows));
  }, [branchDatasetRows, onAskSearch, onClearSelection, searchQuery]);

  return (
    <>
      <PageShell
        className="rd-v2-library-page"
        title="Library"
        lead="See what you have; Library organizes the evidence without making you maintain a filing cabinet."
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
            />
          </div>
        }
        toolbar={
          <>
            <label className="rd-v2-library-toolbar-search" data-testid="library-toolbar-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m21 21-4.2-4.2m1.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search title, field, source, coverage…"
                aria-label="Search library holdings"
                onKeyDown={(e) => {
                  // Live filter; Enter just commits focus so results stay visible.
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
            {searchActive && onAskSearch ? (
              <button
                type="button"
                className="rd-v2-btn sm rd-v2-library-search-ask"
                data-testid="library-search-ask"
                onClick={askCurrentSearch}
              >
                Ask Library
              </button>
            ) : null}
            {searchActive ? (
              <Chip active={sortBy === "relevance"} onClick={() => setSortBy("relevance")}>
                Relevance
              </Chip>
            ) : null}
            <Chip active={sortBy === "name"} onClick={() => setSortBy("name")}>
              Name {sortBy === "name" ? "↑" : "↕"}
            </Chip>
            <Chip active={sortBy === "updated"} onClick={() => setSortBy("updated")}>
              Modified {sortBy === "updated" ? "↓" : "↕"}
            </Chip>
            <Chip active={filterMode === "all"} onClick={() => setFilterMode("all")}>
              All
            </Chip>
            <Chip active={filterMode === "ready"} onClick={() => setFilterMode("ready")}>
              Query ready {readyCount}
            </Chip>
            <Chip active={filterMode === "not_ready"} onClick={() => setFilterMode("not_ready")}>
              Not query-ready {nonReadyCount}
            </Chip>
            <span className="rd-v2-toolbar-spacer" />
            <span className="rd-v2-toolbar-count">
              {navigationLoading && !searchActive
                ? "Organizing collections…"
                : loading && !vaultDatasets.length ? "Loading Library…" : toolbarCountLabel({
                searchActive,
                isRoot,
                folderCount,
                datasetCount: browseDatasetCount,
                visibleCount: isRoot ? estateRows.length : visibleRows.length,
              })}
            </span>
          </>
        }
        footer="select asset → inspect · preview only when query-ready"
        surfaceState={surfaceState}
      >
        {!isRoot ? (
          <div
            className="rd-v2-library-branchline rd-v2-library-pathbar"
            aria-label="Library location status"
            data-navigation-state={navigationLoading ? "loading" : navigationError ? "error" : "ready"}
          >
            <div className="rd-v2-library-pathcopy">
              <strong>{currentFolderName}</strong>
              <p>{branchNote}</p>
            </div>
            <div className="rd-v2-library-pathstats">
              {navigationLoading && !searchActive ? (
                <span>Organizing collection…</span>
              ) : (
                <span>{folderCount} folder{folderCount === 1 ? "" : "s"}</span>
              )}
              <span>
                {browseDatasetCount} asset{browseDatasetCount === 1 ? "" : "s"}
                {searchActive ? " matched" : ""}
              </span>
              <span>{readyCount} query-ready</span>
            </div>
          </div>
        ) : null}
        {loadError ? <DeskError raw={loadError} surface="your Library" /> : null}
        {navigationError ? <DeskError raw={navigationError} surface="Library collections" /> : null}

        {isRoot ? (
          loading && !vaultDatasets.length ? (
            <div className="rd-v2-library-empty" role="status" aria-live="polite">
              <strong>Loading Library holdings…</strong>
              <p>Reading the registered evidence estate before showing its current assets.</p>
            </div>
          ) : (
            <LibraryEvidenceEstate
              assets={estateRows}
              collections={searchActive ? [] : rootCollections}
              collectionsLoading={navigationLoading && !searchActive}
              referenceCount={searchActive ? 0 : referenceCount}
              onOpenCollection={(collection) => onFolderChange(collection.id)}
              onReviewAvailable={onStartProcure ? handleProcureBranch : undefined}
              onSelectDataset={onSelectDataset}
              searchQuery={searchQuery}
            />
          )
        ) : (
          <div className="rd-v2-catalog-list-wrap" data-testid="library-directory">
            {navigationLoading && !searchActive ? (
              <div className="rd-v2-library-empty" role="status" aria-live="polite">
                <strong>Organizing collection…</strong>
                <p>Reading the current research context before showing its holdings.</p>
              </div>
            ) : loading && !vaultDatasets.length ? (
              <div className="rd-v2-library-empty" role="status" aria-live="polite">
                <strong>Loading Library holdings…</strong>
                <p>Reading the registered evidence estate before showing this collection.</p>
              </div>
            ) : visibleRows.length ? (
              <CatalogList
                rows={visibleRows}
                selectedId={selectedId}
                onOpenFolder={(folder) => onFolderChange(folder.id)}
                onSelectDataset={onSelectDataset}
                compact
              />
            ) : (
              <div className="rd-v2-library-empty">
                <strong>{searchActive ? "No assets match this search" : "Nothing else in this collection"}</strong>
                <p>
                  {searchActive
                    ? "Try a broader keyword, or clear the search to see the current collection again."
                    : "Clear the filter or use the breadcrumb to return to Library."}
                </p>
                {!searchActive && (onStartUpload || onStartUrl || onStartProcure) ? (
                  <div className="rd-v2-library-empty-actions">
                    {onStartUpload ? <button type="button" className="rd-v2-btn sm" onClick={() => onStartUpload?.()}>Add files</button> : null}
                    {onStartUrl ? <button type="button" className="rd-v2-btn sm" onClick={() => onStartUrl?.()}>Add URL</button> : null}
                    {onStartProcure ? <button type="button" className="rd-v2-btn sm" onClick={() => onStartProcure?.()}>Find missing data</button> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </PageShell>
      <LibraryAssetInspector
        dataset={selectedDataset}
        onClose={onClearSelection}
        onPreview={() => selectedDataset && onPreviewDataset?.(selectedDataset)}
        onAsk={() => selectedDataset && onAskDataset?.(selectedDataset)}
        onOpenQuery={() => selectedDataset && onOpenQuery?.(selectedDataset.dataset_id)}
      />
    </>
  );
}

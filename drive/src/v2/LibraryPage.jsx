import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  breadcrumbTrail,
  collectDatasetDescendants,
  listFolderChildren,
} from "@/driveTree";
import { buildProfessorVaultTree, datasetTitle, isOpsNoiseDataset } from "@/v2/professorVaultTree";
import { libraryFolderObject } from "@/v2/activeObject";
import { libraryAssetPresentation, statusPillKind } from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { LibraryAssetWorkspace } from "@/v2/LibraryAssetWorkspace";
import { LibraryEvidenceEstate } from "@/v2/LibraryEvidenceEstate";
import { resolveLibrarySelection } from "@/v2/librarySelection";
import { buildLibrarySearchAskPrompt, rankLibraryHoldings } from "@/v2/librarySearch";
import { PageShell } from "@/v2/ui";
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

function verificationReviewCount(rows) {
  return rows.filter((row) =>
    ["partial", "unverified", "unchecked"].includes(libraryVerification(row).kind),
  ).length;
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

function itemPresentationKind(item) {
  if (item?.kind === "folder") return "folder";
  return libraryAssetPresentation(itemDataset(item)).kind;
}

function itemMatchesType(item, mode) {
  if (mode === "all" || item?.kind === "folder") return true;
  const kind = itemPresentationKind(item);
  if (mode === "data") return kind === "dataset" || kind === "metadata_index";
  if (mode === "literature") return kind === "scholarly_work";
  if (mode === "sources") return kind === "live_source";
  return true;
}

function itemNeedsAttention(item) {
  if (item?.kind === "folder") return false;
  const row = itemDataset(item);
  const readiness = statusPillKind(row).kind;
  const verification = libraryVerification(row).kind;
  return readiness !== "query-ready" || !["verified", "matched"].includes(verification);
}

function itemMatchesFilter(item, mode) {
  if (mode === "all" || item?.kind === "folder") return true;
  const row = itemDataset(item);
  const ready = statusPillKind(row).kind === "query-ready";
  if (mode === "ready") return ready;
  if (mode === "review") {
    return ["partial", "unverified", "unchecked"].includes(libraryVerification(row).kind);
  }
  if (mode === "not_ready") return !ready;
  if (mode === "attention") return itemNeedsAttention(item);
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
  showingSearchHits,
  displayCount,
  folderCount,
  partitionCount,
  datasetCount,
}) {
  if (!displayCount && !folderCount) {
    if (showingSearchHits) return "No assets match this search in the current scope";
    return isRoot ? "No registered evidence yet" : "No holdings in this branch";
  }
  if (showingSearchHits) {
    return `${displayCount} matching asset${displayCount === 1 ? "" : "s"} in this scope`;
  }
  if (isRoot) {
    const parts = [];
    if (datasetCount) parts.push(`${datasetCount} evidence asset${datasetCount === 1 ? "" : "s"}`);
    if (folderCount) parts.push(`${folderCount} research area${folderCount === 1 ? "" : "s"}`);
    if (partitionCount) parts.push(`${partitionCount} collection${partitionCount === 1 ? "" : "s"}`);
    return parts.join(" · ") || "Browse the registered evidence estate";
  }
  const parts = [];
  if (folderCount) parts.push(`${folderCount} nested folder${folderCount === 1 ? "" : "s"}`);
  if (datasetCount) parts.push(`${datasetCount} held asset${datasetCount === 1 ? "" : "s"}`);
  return parts.join(" · ") || "No holdings in this branch";
}

function toolbarCountLabel({ searchActive, datasetCount, visibleCount }) {
  if (searchActive) {
    return `${visibleCount} match${visibleCount === 1 ? "" : "es"}`;
  }
  if (visibleCount !== datasetCount) {
    return `${visibleCount} of ${datasetCount} assets`;
  }
  return `${datasetCount} asset${datasetCount === 1 ? "" : "s"}`;
}

function smartViewTitle(filterMode) {
  if (filterMode === "review") return "Needs verification";
  if (filterMode === "ready") return "Query ready";
  if (filterMode === "attention") return "Needs attention";
  if (filterMode === "not_ready") return "Not query-ready";
  return "All evidence";
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
  onReviewAvailable,
  onSearchWider,
  searchQuery = "",
  onSearchChange,
  selectionHoldings,
  selectionFallback,
  referenceCount = 0,
}) {
  const [sortBy, setSortBy] = useState("name");
  const [typeMode, setTypeMode] = useState("all");
  const [filterMode, setFilterMode] = useState("all");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const searchInputRef = useRef(null);
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

  const catalogDatasets = useMemo(
    () => (datasets || []).filter((row) => !isOpsNoiseDataset(row)),
    [datasets],
  );
  const allHeldDatasets = useMemo(
    () => (selectionHoldings || catalogDatasets).filter((row) => !isOpsNoiseDataset(row)),
    [catalogDatasets, selectionHoldings],
  );
  const rankedSearchDatasets = useMemo(
    () => (searchActive ? rankLibraryHoldings(allHeldDatasets, searchQuery, librarySearchNav) : []),
    [allHeldDatasets, librarySearchNav, searchActive, searchQuery],
  );

  useEffect(() => {
    if (searchActive) {
      setSortBy((current) => (current === "name" ? "relevance" : current));
    } else {
      setSortBy((current) => (current === "relevance" ? "name" : current));
    }
  }, [searchActive]);

  useEffect(() => {
    const focusLibrarySearch = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", focusLibrarySearch);
    return () => window.removeEventListener("keydown", focusLibrarySearch);
  }, []);

  const surfaceState = resolveSurfaceLifecycle({
    loading: loading || navigationLoading,
    error: loadError || navigationError,
    count: catalogDatasets.length,
  });
  const selectedDataset = useMemo(
    () =>
      resolveLibrarySelection({
        selectedId,
        holdings: selectionHoldings || catalogDatasets,
        fallback: selectionFallback,
        allowUnknown: loading,
      }),
    [catalogDatasets, loading, selectedId, selectionHoldings, selectionFallback],
  );

  // Search narrows the evidence pane; it no longer rebuilds or removes the directory.
  const tree = useMemo(
    () => buildProfessorVaultTree(catalogDatasets, partitions, shelves),
    [catalogDatasets, partitions, shelves],
  );

  const trail = useMemo(() => {
    const crumbs = breadcrumbTrail(tree, folderId);
    if (crumbs[0]) crumbs[0].name = "Library";
    return crumbs;
  }, [tree, folderId]);

  const destination = useMemo(() => folderDestination(trail, folderId), [trail, folderId]);
  const isRoot = !folderId;
  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);
  const folderRows = useMemo(
    () => sortItems(items.filter((item) => item?.kind === "folder"), "name"),
    [items],
  );
  const folderCount = folderRows.length;

  const rootCollections = useMemo(
    () =>
      sortItems(
        listFolderChildren(tree, "").filter((item) => item?.kind === "folder"),
        "name",
      ).map((folder) => ({
        ...folder,
        asset_count: collectDatasetDescendants(tree, folder.id).length,
      })),
    [tree],
  );

  const partitionCount = useMemo(
    () =>
      rootCollections.reduce(
        (sum, shelf) =>
          sum + Object.values(shelf.children || {}).filter((child) => child?.kind === "folder").length,
        0,
      ),
    [rootCollections],
  );

  const scopeDatasetRows = useMemo(
    () =>
      isRoot
        ? catalogDatasets
        : collectDatasetDescendants(tree, folderId).map(itemDataset),
    [catalogDatasets, folderId, isRoot, tree],
  );
  const scopeDatasetIds = useMemo(
    () => new Set(scopeDatasetRows.map((row) => String(row?.dataset_id || row?.id || "")).filter(Boolean)),
    [scopeDatasetRows],
  );
  const branchDatasetRows = useMemo(
    () =>
      searchActive
        ? rankedSearchDatasets.filter((row) => scopeDatasetIds.has(String(row?.dataset_id || row?.id || "")))
        : scopeDatasetRows,
    [rankedSearchDatasets, scopeDatasetIds, scopeDatasetRows, searchActive],
  );

  const estateRows = useMemo(
    () =>
      sortItems(
        branchDatasetRows
          .map(datasetListItem)
          .filter((item) => itemMatchesType(item, typeMode) && itemMatchesFilter(item, filterMode)),
        sortBy,
      ),
    [branchDatasetRows, filterMode, sortBy, typeMode],
  );

  const readyCount = readinessCount(scopeDatasetRows);
  const reviewCount = verificationReviewCount(scopeDatasetRows);
  const attentionCount = scopeDatasetRows.filter((row) => itemNeedsAttention(datasetListItem(row))).length;
  const nonReadyCount = Math.max(0, scopeDatasetRows.length - readyCount);
  const browseDatasetCount = scopeDatasetRows.length;

  const totalReadyCount = readinessCount(catalogDatasets);
  const totalReviewCount = verificationReviewCount(catalogDatasets);
  const totalAttentionCount = catalogDatasets.filter((row) => itemNeedsAttention(datasetListItem(row))).length;

  const currentFolderName = isRoot ? "Library" : trail[trail.length - 1]?.name || "Library";
  const scopeTitle = isRoot ? smartViewTitle(filterMode) : currentFolderName;
  const branchNote = branchStatusNote({
    isRoot,
    showingSearchHits: searchActive,
    displayCount: estateRows.length,
    folderCount,
    partitionCount,
    datasetCount: browseDatasetCount,
  });
  const scopeNote = searchActive
    ? `${estateRows.length} match${estateRows.length === 1 ? "" : "es"} within ${isRoot ? "the full Library" : currentFolderName}`
    : branchNote;

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
        itemCount: estateRows.length,
        referenceCount: isRoot ? referenceCount : 0,
      }),
    [branchNote, browseDatasetCount, destination, estateRows.length, folderCount, folderId, isRoot, readyCount, referenceCount, trail],
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

  const resetFilters = useCallback(() => {
    setTypeMode("all");
    setFilterMode("all");
  }, []);

  const chooseSmartView = useCallback(
    (mode) => {
      onFolderChange?.("");
      onSearchChange?.("");
      setTypeMode("all");
      setFilterMode(mode);
    },
    [onFolderChange, onSearchChange],
  );

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
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search title, field, source, coverage…"
                aria-label="Search library holdings"
                aria-keyshortcuts="/"
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              <kbd aria-hidden="true">/</kbd>
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
            <div className="rd-v2-library-toolbar-filters" aria-label="Library filters">
              <label className="rd-v2-library-filter-control">
                <span>Type</span>
                <select
                  data-testid="library-type-filter"
                  aria-label="Filter Library by type"
                  value={typeMode}
                  onChange={(event) => setTypeMode(event.target.value)}
                >
                  <option value="all">Everything</option>
                  <option value="data">Data</option>
                  <option value="literature">Literature</option>
                  <option value="sources">Live sources</option>
                </select>
              </label>
              <label className="rd-v2-library-filter-control">
                <span>Readiness</span>
                <select
                  data-testid="library-state-filter"
                  aria-label="Filter Library by readiness or verification"
                  value={filterMode}
                  onChange={(event) => setFilterMode(event.target.value)}
                >
                  <option value="all">Any</option>
                  <option value="ready">Query ready · {readyCount}</option>
                  <option value="review">Needs verification · {reviewCount}</option>
                  <option value="attention">Needs attention · {attentionCount}</option>
                  <option value="not_ready">Not query-ready · {nonReadyCount}</option>
                </select>
              </label>
              <label className="rd-v2-library-filter-control">
                <span>Sort</span>
                <select
                  data-testid="library-sort-filter"
                  aria-label="Sort Library"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  {searchActive ? <option value="relevance">Relevance</option> : null}
                  <option value="name">Name</option>
                  <option value="updated">Modified</option>
                </select>
              </label>
            </div>
            <span className="rd-v2-toolbar-spacer" />
            <span className="rd-v2-toolbar-count">
              {navigationLoading && !catalogDatasets.length
                ? "Organizing collections…"
                : loading && !catalogDatasets.length
                  ? "Loading Library…"
                  : toolbarCountLabel({
                      searchActive,
                      datasetCount: browseDatasetCount,
                      visibleCount: estateRows.length,
                    })}
            </span>
          </>
        }
        footer="choose scope → select evidence → inspect · preview only when query-ready"
        surfaceState={surfaceState}
      >
        {loadError ? <DeskError raw={loadError} surface="your Library" /> : null}
        {navigationError ? <DeskError raw={navigationError} surface="Library collections" /> : null}

        {loading && !catalogDatasets.length ? (
          <div className="rd-v2-library-empty" role="status" aria-live="polite">
            <strong>Loading Library holdings…</strong>
            <p>Reading the registered evidence estate before showing its current assets.</p>
          </div>
        ) : (
          <LibraryEvidenceEstate
            assets={estateRows}
            collections={rootCollections}
            collectionsLoading={navigationLoading}
            folderId={folderId}
            trail={trail}
            filterMode={filterMode}
            scopeTitle={scopeTitle}
            scopeNote={scopeNote}
            scopeAssetCount={scopeDatasetRows.length}
            scopeReadyCount={readyCount}
            scopeReviewCount={reviewCount}
            totalAssetCount={catalogDatasets.length}
            totalReadyCount={totalReadyCount}
            totalReviewCount={totalReviewCount}
            totalAttentionCount={totalAttentionCount}
            referenceCount={!searchActive && isRoot && filterMode === "all" ? referenceCount : 0}
            selectedId={selectedId}
            onOpenCollection={(collection) => onFolderChange(collection.id)}
            onOpenRoot={() => onFolderChange("")}
            onChooseSmartView={chooseSmartView}
            onReviewAvailable={onReviewAvailable}
            onSelectDataset={onSelectDataset}
            searchQuery={searchQuery}
            searchMatchCount={branchDatasetRows.length}
            onAskCurrentSearch={onAskSearch ? askCurrentSearch : undefined}
            onSearchWider={onSearchWider}
            onResetFilters={resetFilters}
          />
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

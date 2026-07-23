import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DRIVE_LAB,
  buildConsumerDriveTree,
  breadcrumbTrail,
  listFolderChildren,
} from "@/driveTree";
import { libraryFolderObject } from "@/v2/activeObject";
import { LibraryEstateBrowser } from "@/v2/LibraryEstateBrowser";
import { collectionOrder, datasetBelongsToFolder, libraryAssetCounts } from "@/v2/libraryEstate";
import { PageShell } from "@/v2/ui";
import { displayName, statusPill } from "@/v2/datasetMeta";
import { facultyFacingRecords, isInternalValidationRecord } from "@/v2/productVisibility";

function datasetListItem(row) {
  return { kind: "dataset", id: row.dataset_id, name: row.name, row };
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
  return libraryAssetCounts([itemDataset(item)]).queryReady === 1;
}

function sortItems(rows, sortBy, isRoot) {
  return [...rows].sort((a, b) => {
    if (a?.kind === "folder" && b?.kind !== "folder") return -1;
    if (a?.kind !== "folder" && b?.kind === "folder") return 1;
    if (isRoot && a?.kind === "folder" && b?.kind === "folder") {
      const delta = collectionOrder(a) - collectionOrder(b);
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
  if (!folderId) return "Lab";
  return trail.map((crumb) => crumb.name).join(" / ");
}

function branchStatusNote({ isRoot, items, showingBranchFallback, displayCount, folderCount, datasetCount }) {
  if (!displayCount) return isRoot ? "No indexed collections yet" : "No holdings in this collection";
  if (showingBranchFallback) return `${displayCount} dataset${displayCount === 1 ? "" : "s"} matched here`;
  if (items.length) {
    const parts = [];
    if (folderCount) parts.push(`${folderCount} collection${folderCount === 1 ? "" : "s"}`);
    if (datasetCount) parts.push(`${datasetCount} dataset${datasetCount === 1 ? "" : "s"}`);
    return parts.join(", ") || `${displayCount} item${displayCount === 1 ? "" : "s"}`;
  }
  return `${displayCount} item${displayCount === 1 ? "" : "s"} in collection`;
}

function LibraryBreadcrumb({ trail, onFolderChange }) {
  if (trail.length <= 1) return null;
  return (
    <nav className="rd-v2-breadcrumb rd-v2-crumb" aria-label="Breadcrumb">
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1;
        return (
          <span key={crumb.id || "root"} className="rd-v2-crumb-item">
            {index > 0 ? <span className="sep">›</span> : null}
            {last ? <span className="here">{crumb.name}</span> : <button type="button" onClick={() => onFolderChange(crumb.id)}>{crumb.name}</button>}
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
      <button type="button" className="rd-v2-btn sm rd-v2-library-action-btn primary" aria-haspopup="menu" aria-expanded={open} aria-label="Open new library item menu" onClick={onToggle}>
        New ▾
      </button>
      {open ? (
        <div className="rd-v2-library-action-menu" role="menu" aria-label="New library item">
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onUploadFile}>Upload file...</button>
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onAddUrl}>Add URL / DOI...</button>
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" onClick={onProcure}>Find missing data...</button>
          <button type="button" role="menuitem" className="rd-v2-library-menu-item" disabled>New folder</button>
        </div>
      ) : null}
    </div>
  );
}

function LibraryHeadActions({ newMenuOpen, onToggleNewMenu, onCloseNewMenu, onOpenUpload, onOpenUrlModal, onProcureBranch, onRefresh }) {
  return (
    <div className="rd-v2-library-actions">
      <LibraryNewMenu
        open={newMenuOpen}
        onToggle={onToggleNewMenu}
        onClose={onCloseNewMenu}
        onUploadFile={onOpenUpload}
        onAddUrl={onOpenUrlModal}
        onProcure={onProcureBranch}
      />
      <button type="button" className="rd-v2-btn sm rd-v2-library-action-btn ghost" onClick={onRefresh} disabled={!onRefresh}>Refresh</button>
    </div>
  );
}

function datasetText(row) {
  const fields = Array.isArray(row?.fields)
    ? row.fields.join(" ")
    : Array.isArray(row?.columns)
      ? row.columns.map((field) => typeof field === "string" ? field : field?.name).filter(Boolean).join(" ")
      : "";
  return [row?.dataset_id, row?.name, row?.description, row?.summary, row?.source, row?.grain, row?.coverage, fields]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function queryTokens(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 2)
    .filter((token) => !["what", "could", "would", "with", "from", "that", "this", "data", "study", "research"].includes(token));
}

function readiness(row) {
  return statusPill(row) || String(row?.analysis_readiness || row?.readiness || "Unknown");
}

function ResearchFitRow({ row, onSelect, onPreview }) {
  return (
    <article className="rd-rc3-library-fit-row">
      <button type="button" onClick={() => onSelect?.(row)}>
        <strong>{displayName(row)}</strong>
        <span>{row?.description || row?.summary || [row?.grain, row?.coverage].filter(Boolean).join(" · ") || "Research asset"}</span>
      </button>
      <div>
        <small>{row?.grain || "Grain unknown"}</small>
        <em>{readiness(row)}</em>
        <button type="button" onClick={() => onPreview?.(row)}>Preview</button>
      </div>
    </article>
  );
}

function LibraryResearchView({ datasets, onSelectDataset, onPreviewDataset, onProcure }) {
  const [query, setQuery] = useState("disclosure quality Taiwan filings amendments corrections");
  const tokens = useMemo(() => queryTokens(query), [query]);
  const scored = useMemo(() => datasets.map((row) => {
    const text = datasetText(row);
    const score = tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
    return { row, score };
  }).sort((a, b) => b.score - a.score), [datasets, tokens]);
  const direct = scored.filter((item) => item.score >= Math.max(1, Math.ceil(tokens.length / 3))).slice(0, 6).map((item) => item.row);
  const supporting = scored.filter((item) => !direct.includes(item.row) && libraryAssetCounts([item.row]).queryReady === 1).slice(0, 5).map((item) => item.row);
  const noExact = direct.length === 0;

  return (
    <div className="rd-rc3-library-research" data-testid="library-research-view">
      <section className="rd-rc3-library-question">
        <div>
          <span>Ask the estate</span>
          <h2>What does the lab already own that can support the question?</h2>
          <p>This view groups held assets by research fit. It does not upgrade metadata into observed evidence or claim complete semantic recall.</p>
        </div>
        <label>
          <span>Research question or evidence need</span>
          <textarea rows={3} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </section>

      <section className="rd-rc3-library-fit-grid">
        <div>
          <header><span>01</span><div><strong>Directly useful</strong><small>Explicit overlap with the current evidence need</small></div></header>
          {direct.length ? direct.map((row) => <ResearchFitRow key={row.dataset_id} row={row} onSelect={onSelectDataset} onPreview={onPreviewDataset} />) : <p>No held asset explicitly matches the current wording.</p>}
        </div>
        <div>
          <header><span>02</span><div><strong>Supporting evidence</strong><small>Query-ready assets that may supply outcomes, identity, or validation</small></div></header>
          {supporting.length ? supporting.map((row) => <ResearchFitRow key={row.dataset_id} row={row} onSelect={onSelectDataset} onPreview={onPreviewDataset} />) : <p>No supporting query-ready asset is classified yet.</p>}
        </div>
        <div>
          <header><span>03</span><div><strong>Estate gap</strong><small>What should be investigated beyond current holdings</small></div></header>
          <article className="rd-rc3-library-gap">
            <strong>{noExact ? "The estate does not explicitly cover this need" : "Coverage still requires verification"}</strong>
            <p>{noExact ? "Search external source space or describe the missing fields more precisely." : "Open the strongest assets and verify grain, period, provenance, and field semantics before construction."}</p>
            <button type="button" className="rd-v2-btn sm primary" onClick={onProcure}>Procure missing evidence</button>
          </article>
        </div>
      </section>
    </div>
  );
}

function normalizedFields(dataset) {
  const raw = dataset?.fields || dataset?.columns || dataset?.schema?.fields || [];
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((field) => {
    if (typeof field === "string") return { name: field, type: "Type not reported" };
    return {
      name: field?.name || field?.field || field?.column || "Unnamed field",
      type: field?.type || field?.dtype || "Type not reported",
      completeness: field?.completeness || field?.non_null_rate || field?.coverage || null,
    };
  });
}

function AssetWorkspace({ dataset, onBack, onPreview }) {
  const fields = normalizedFields(dataset);
  const unknowns = [
    dataset?.coverage ? null : "Temporal coverage is not reported.",
    dataset?.grain ? null : "Research grain is not reported.",
    fields.length ? null : "A durable field profile is not available in this response.",
    /instant|query.?ready/i.test(String(dataset?.analysis_readiness || "")) ? null : "Query readiness is not established.",
  ].filter(Boolean);

  return (
    <article className="rd-rc3-asset-workspace" data-testid="library-asset-workspace">
      <header>
        <button type="button" className="rd-rc3-back" onClick={onBack}>← Estate</button>
        <div>
          <span>Registered research asset</span>
          <h2>{displayName(dataset)}</h2>
          <p className="mono">{dataset.dataset_id}</p>
        </div>
        <em>{readiness(dataset)}</em>
      </header>

      <section className="rd-rc3-asset-truth">
        <div>
          <small>Observed from current registry response</small>
          <dl>
            <div><dt>Coverage</dt><dd>{dataset?.coverage || dataset?.date_range || "Not reported"}</dd></div>
            <div><dt>Grain</dt><dd>{dataset?.grain || "Not reported"}</dd></div>
            <div><dt>Source</dt><dd>{dataset?.source || dataset?.provider || "Not reported"}</dd></div>
            <div><dt>Readiness</dt><dd>{readiness(dataset)}</dd></div>
          </dl>
        </div>
        <div>
          <small>Research interpretation</small>
          <h3>{dataset?.description || dataset?.summary || "No durable interpretation has been recorded."}</h3>
          <p>Interpretation remains separate from observed registry facts. Use Detail and Ask to inspect provenance, risk, and intended research use.</p>
        </div>
      </section>

      <section className="rd-rc3-asset-lower">
        <div>
          <header><strong>Field profile</strong><span>{fields.length ? `${fields.length} shown` : "Not profiled"}</span></header>
          {fields.length ? (
            <div className="rd-rc3-field-table">
              {fields.map((field) => (
                <div key={field.name}><strong>{field.name}</strong><span>{field.type}</span><em>{field.completeness == null ? "Unknown completeness" : `${field.completeness}`}</em></div>
              ))}
            </div>
          ) : <p>No field-level profile was returned for this asset.</p>}
        </div>
        <div>
          <header><strong>Unknowns</strong><span>{unknowns.length}</span></header>
          {unknowns.length ? unknowns.map((item) => <p key={item}>{item}</p>) : <p>No basic metadata unknown is visible in the current response. This is not a completeness claim.</p>}
          <button type="button" className="rd-v2-btn sm primary" onClick={() => onPreview?.(dataset)}>Preview rows</button>
        </div>
      </section>
    </article>
  );
}

export function LibraryPage({
  datasets,
  folderId,
  onFolderChange,
  selectedId,
  onSelectDataset,
  onPreviewDataset,
  onRefresh,
  onFocusFolder,
  onStartUpload,
  onStartUrl,
  onStartProcure,
}) {
  const [sortBy, setSortBy] = useState("name");
  const [filterMode, setFilterMode] = useState("all");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState("estate");
  const [showTechnical, setShowTechnical] = useState(false);

  const facultyDatasets = useMemo(() => facultyFacingRecords(datasets), [datasets]);
  const technicalCount = Math.max(0, datasets.length - facultyDatasets.length);
  const rawSelected = useMemo(() => datasets.find((row) => row.dataset_id === selectedId) || null, [datasets, selectedId]);
  const technicalSelection = Boolean(rawSelected && isInternalValidationRecord(rawSelected));
  const technicalVisible = showTechnical || technicalSelection;
  const estateDatasets = technicalVisible ? datasets : facultyDatasets;

  const tree = useMemo(() => buildConsumerDriveTree(estateDatasets, { scope: DRIVE_LAB }), [estateDatasets]);
  const trail = useMemo(() => {
    const crumbs = breadcrumbTrail(tree, folderId);
    if (crumbs[0]) crumbs[0].name = "Lab";
    return crumbs;
  }, [tree, folderId]);
  const destination = useMemo(() => folderDestination(trail, folderId), [trail, folderId]);
  const isRoot = !folderId;
  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);
  const branchRows = useMemo(() => estateDatasets.filter((row) => datasetBelongsToFolder(row, folderId)).map(datasetListItem), [estateDatasets, folderId]);
  const displayRows = useMemo(() => items.length ? items : branchRows, [items, branchRows]);
  const visibleRows = useMemo(() => sortItems(displayRows.filter((item) => itemMatchesFilter(item, filterMode)), sortBy, isRoot), [displayRows, filterMode, sortBy, isRoot]);
  const currentFolderName = isRoot ? "Lab" : trail[trail.length - 1]?.name || "Lab";
  const showingBranchFallback = !items.length && branchRows.length > 0;
  const branchDatasetRows = useMemo(() => isRoot ? estateDatasets : branchRows.map(itemDataset), [branchRows, estateDatasets, isRoot]);
  const branchCounts = libraryAssetCounts(branchDatasetRows);
  const readyCount = branchCounts.queryReady;
  const folderCount = visibleRows.filter((item) => item.kind === "folder").length;
  const datasetCount = branchDatasetRows.length;
  const branchNote = branchStatusNote({ isRoot, items, showingBranchFallback, displayCount: displayRows.length, folderCount, datasetCount });
  const selectedDataset = useMemo(() => estateDatasets.find((row) => row.dataset_id === selectedId) || null, [estateDatasets, selectedId]);
  const branchObject = useMemo(() => libraryFolderObject({
    folderId,
    trail,
    destination,
    note: branchNote,
    folderCount,
    datasetCount,
    readyCount,
    connectedCount: branchCounts.connected,
    metadataOnlyCount: branchCounts.metadataOnly,
    unknownCount: branchCounts.unknown,
    itemCount: visibleRows.length,
  }), [branchCounts.connected, branchCounts.metadataOnly, branchCounts.unknown, branchNote, datasetCount, destination, folderCount, folderId, readyCount, trail, visibleRows.length]);

  useEffect(() => {
    if (!selectedId) onFocusFolder?.(branchObject);
  }, [branchObject, onFocusFolder, selectedId]);

  const closeNewMenu = useCallback(() => setNewMenuOpen(false), []);
  const openUploadRail = useCallback(() => { setNewMenuOpen(false); onStartUpload?.(branchObject); }, [branchObject, onStartUpload]);
  const openUrlRail = useCallback(() => { setNewMenuOpen(false); onStartUrl?.(branchObject); }, [branchObject, onStartUrl]);
  const handleProcureBranch = useCallback(() => { setNewMenuOpen(false); onStartProcure?.(branchObject); }, [branchObject, onStartProcure]);

  return (
    <PageShell
      className="rd-v2-library-page rd-rc3-library-page"
      title="Library"
      lead="Browse the exact estate, understand individual assets, or ask what held evidence can support the current research question."
      headExtra={
        <div className="rd-v2-library-headline">
          <LibraryBreadcrumb trail={trail} onFolderChange={onFolderChange} />
          <LibraryHeadActions
            newMenuOpen={newMenuOpen}
            onToggleNewMenu={() => setNewMenuOpen((open) => !open)}
            onCloseNewMenu={closeNewMenu}
            onOpenUpload={openUploadRail}
            onOpenUrlModal={openUrlRail}
            onProcureBranch={handleProcureBranch}
            onRefresh={onRefresh}
          />
        </div>
      }
      toolbar={
        <div className="rd-rc3-library-modes" role="tablist" aria-label="Library view">
          <button type="button" role="tab" aria-selected={viewMode === "estate"} className={viewMode === "estate" ? "on" : ""} onClick={() => setViewMode("estate")}>Estate</button>
          <button type="button" role="tab" aria-selected={viewMode === "research"} className={viewMode === "research" ? "on" : ""} onClick={() => setViewMode("research")}>Research fit</button>
          {technicalCount ? (
            <button
              type="button"
              className={technicalVisible ? "on" : ""}
              aria-pressed={technicalVisible}
              onClick={() => setShowTechnical((visible) => !visible)}
            >
              {technicalVisible ? "Hide technical" : `Technical (${technicalCount})`}
            </button>
          ) : null}
          <span>{readyCount} query-ready · {datasetCount} holdings</span>
        </div>
      }
    >
      {selectedDataset ? (
        <AssetWorkspace
          dataset={selectedDataset}
          onBack={() => onFolderChange(folderId || "")}
          onPreview={onPreviewDataset}
        />
      ) : viewMode === "research" ? (
        <LibraryResearchView
          datasets={estateDatasets}
          onSelectDataset={onSelectDataset}
          onPreviewDataset={onPreviewDataset}
          onProcure={handleProcureBranch}
        />
      ) : (
        <LibraryEstateBrowser
          rows={visibleRows}
          datasets={estateDatasets}
          branchDatasets={branchDatasetRows}
          isRoot={isRoot}
          currentFolderName={currentFolderName}
          branchNote={branchNote}
          selectedId={selectedId}
          filterMode={filterMode}
          sortBy={sortBy}
          onFilterChange={setFilterMode}
          onSortChange={setSortBy}
          onOpenFolder={(folder) => onFolderChange(folder.id)}
          onSelectDataset={onSelectDataset}
          onPreviewDataset={onPreviewDataset}
        />
      )}
    </PageShell>
  );
}

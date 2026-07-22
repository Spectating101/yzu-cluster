import { displayName, statusPillKind } from "@/v2/datasetMeta";
import { StatusPill } from "@/v2/StatusPill";
import { assetMeta, assetPurpose, assetTypeLabel, libraryAssetCounts } from "@/v2/libraryEstate";

function LibraryFilterMenu({ mode, counts, onChange }) {
  return (
    <details className="rd-v2-library-control-menu" data-testid="library-filter-menu">
      <summary><span>Filter</span>{mode === "ready" ? <strong>Query ready</strong> : null}</summary>
      <div className="rd-v2-library-control-popover" role="group" aria-label="Filter Library assets">
        <button type="button" className={mode === "all" ? "on" : ""} onClick={(event) => { onChange("all"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span>All assets</span><b>{counts.total}</b></button>
        <button type="button" className={mode === "ready" ? "on" : ""} onClick={(event) => { onChange("ready"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span>Query ready</span><b>{counts.queryReady}</b></button>
      </div>
    </details>
  );
}

function LibrarySortMenu({ sortBy, onChange }) {
  return (
    <details className="rd-v2-library-control-menu" data-testid="library-sort-menu">
      <summary><span>Sort</span><strong>{sortBy === "updated" ? "Last modified" : "Name"}</strong></summary>
      <div className="rd-v2-library-control-popover" role="group" aria-label="Sort Library assets">
        <button type="button" className={sortBy === "name" ? "on" : ""} onClick={(event) => { onChange("name"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Name</button>
        <button type="button" className={sortBy === "updated" ? "on" : ""} onClick={(event) => { onChange("updated"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Last modified</button>
      </div>
    </details>
  );
}

function FolderRow({ folder, onOpen }) {
  const childCount = Object.keys(folder?.children || {}).length;
  return (
    <button type="button" className="rd-recovery-library-folder" onClick={() => onOpen(folder)} data-testid="library-collection" data-kind="folder">
      <span className="rd-recovery-library-folder-icon" aria-hidden>▰</span>
      <span><strong>{folder?.name || "Untitled folder"}</strong><small>{childCount} indexed item{childCount === 1 ? "" : "s"}</small></span>
      <em>Open →</em>
    </button>
  );
}

function AssetRow({ item, selected, onSelect, onDoubleClick }) {
  const row = item?.row || item;
  const purpose = assetPurpose(row);
  const meta = assetMeta(row);
  const state = statusPillKind(row);
  return (
    <button
      type="button"
      className={`rd-v2-library-asset${selected ? " selected" : ""}`}
      onClick={() => onSelect(row)}
      onDoubleClick={() => onDoubleClick?.(row)}
      data-kind="dataset"
      data-readiness={state.kind}
      aria-pressed={selected}
    >
      <span className="rd-v2-library-asset-main">
        <span className="rd-v2-library-asset-heading"><strong>{displayName(row)}</strong><StatusPill dataset={row} /></span>
        {purpose ? <span className="rd-v2-library-asset-purpose">{purpose}</span> : null}
        {meta.length ? <span className="rd-v2-library-asset-meta">{meta.map((value) => <em key={value}>{value}</em>)}</span> : null}
      </span>
      <span className="rd-v2-library-asset-type">{assetTypeLabel(row)}</span>
      <span className="rd-v2-library-row-arrow" aria-hidden>→</span>
    </button>
  );
}

export function LibraryEstateBrowser({
  rows,
  branchDatasets,
  isRoot,
  currentFolderName,
  branchNote,
  selectedId,
  filterMode,
  sortBy,
  onFilterChange,
  onSortChange,
  onOpenFolder,
  onSelectDataset,
  onPreviewDataset,
}) {
  const folders = rows.filter((item) => item?.kind === "folder");
  const assets = rows.filter((item) => item?.kind !== "folder");
  const counts = libraryAssetCounts(branchDatasets);
  const location = isRoot ? "Lab root" : currentFolderName;

  return (
    <div className="rd-v2-library-estate rd-recovery-library-browser" data-testid="library-estate-browser">
      <section className="rd-recovery-library-location" aria-label="Library branch">
        <div>
          <span>Current location</span>
          <h2>{location}</h2>
          <p>{branchNote || "Browse the lab’s working data vault. Select a dataset for readiness, provenance, preview, and Ask actions."}</p>
        </div>
        <dl>
          <div><dt>Folders</dt><dd>{folders.length}</dd></div>
          <div><dt>Datasets</dt><dd>{counts.total}</dd></div>
          <div><dt>Query-ready</dt><dd>{counts.queryReady}</dd></div>
        </dl>
      </section>

      <div className="rd-recovery-library-controls">
        <span>{rows.length} item{rows.length === 1 ? "" : "s"}</span>
        <LibraryFilterMenu mode={filterMode} counts={counts} onChange={onFilterChange} />
        <LibrarySortMenu sortBy={sortBy} onChange={onSortChange} />
      </div>

      {folders.length ? (
        <section className="rd-recovery-library-section" aria-label="Folders">
          <header><h3>Folders</h3><span>{folders.length}</span></header>
          <div>{folders.map((folder) => <FolderRow key={folder.id} folder={folder} onOpen={onOpenFolder} />)}</div>
        </section>
      ) : null}

      {assets.length ? (
        <section className="rd-recovery-library-section" aria-label="Data assets">
          <header><h3>Data assets</h3><span>{assets.length}</span></header>
          <div className="rd-v2-library-assets">
            {assets.map((item) => {
              const row = item?.row || item;
              return <AssetRow key={row.dataset_id || item.id} item={item} selected={selectedId === row.dataset_id} onSelect={onSelectDataset} onDoubleClick={onPreviewDataset} />;
            })}
          </div>
        </section>
      ) : null}

      {!rows.length ? <div className="rd-v2-library-empty"><strong>No holdings in this branch</strong><p>Clear the filter or return to Lab root.</p></div> : null}
    </div>
  );
}

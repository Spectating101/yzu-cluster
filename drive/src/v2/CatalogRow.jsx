import { statusPill, displayName, libraryAssetKind, rowSubtitle } from "@/v2/datasetMeta";
import { datasetBrowsePathLabel, folderBrowseSummary } from "@/v2/folderBrowseSummary";
import { StatusPill } from "@/v2/StatusPill";
import { SourceRibbon } from "@/v2/ui";
import "@/v2/library-folder-continuity.css";

const DatasetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);
const ScholarlyWorkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 2h8l4 4v16H6z"/>
    <path d="M14 2v5h5"/>
    <path d="M9 12h6M9 16h6"/>
  </svg>
);
const FolderRowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

function datasetDescription(dataset) {
  return dataset?.description
    || dataset?.recommended_use
    || dataset?.source
    || null;
}

function scholarlySubtitle(dataset) {
  return [
    dataset?.doi || dataset?.url || dataset?.source_system,
    dataset?.publisher || dataset?.source,
  ].filter(Boolean).join(" · ");
}

function folderDatasetChildren(item = {}) {
  return Object.values(item.children || {})
    .filter((child) => child?.kind === "dataset")
    .sort((a, b) => displayName(a?.row || a).localeCompare(displayName(b?.row || b), undefined, { sensitivity: "base" }));
}

function FolderDatasetPreview({ item, onSelect }) {
  const children = folderDatasetChildren(item);
  if (!children.length) return null;

  return (
    <div className="rd-v2-catalog-folder-preview" aria-label={`Evidence in ${item.name || "folder"}`}>
      {children.map((child, index) => {
        const dataset = child?.row || child;
        const source = dataset?.source || dataset?.publisher || dataset?.source_system || dataset?.source_route || "Source not recorded";
        return (
          <button
            type="button"
            className="rd-v2-catalog-folder-child"
            data-kind="dataset"
            key={dataset?.dataset_id || child?.id || `${item.id}-${index}`}
            onClick={() => onSelect?.(dataset)}
          >
            <span className="rd-v2-catalog-folder-branch" aria-hidden="true">
              {index === children.length - 1 ? "└" : "├"}
            </span>
            <span className="rd-v2-catalog-folder-child-copy">
              <strong>{displayName(dataset)}</strong>
              <em>{source}</em>
            </span>
            <StatusPill dataset={dataset} label={statusPill(dataset)} />
          </button>
        );
      })}
    </div>
  );
}

export function CatalogRow({
  item,
  selected,
  onSelect,
  onOpenFolder,
  onDoubleClick,
  external = false,
  compact = false,
  rowState,
}) {
  const isFolder = item.kind === "folder";
  const dataset = item.row || item;
  const assetKind = isFolder ? "folder" : libraryAssetKind(dataset);
  const isScholarly = assetKind === "scholarly_work";
  const title = isFolder ? item.name : displayName(dataset);
  const folderSummary = isFolder ? folderBrowseSummary(item) : null;
  const pathLabel = !isFolder ? datasetBrowsePathLabel(item) : "";
  const sub = isFolder
    ? folderSummary.sub
    : isScholarly
      ? scholarlySubtitle(dataset)
      : rowSubtitle(dataset);
  const desc = isFolder
    ? folderSummary.desc
    : compact
      ? null
      : datasetDescription(dataset);
  const state = !isFolder && rowState ? rowState(dataset) : null;
  const kind = isFolder ? "folder" : external ? "external" : assetKind.replace(/_/g, "-");

  if (isFolder) {
    return (
      <li className="rd-v2-catalog-folder-node">
        <button
          type="button"
          className="row rd-v2-catalog-folder-head"
          data-kind="folder"
          onClick={() => onOpenFolder(item)}
        >
          <span className="rd-v2-row-icon">
            <FolderRowIcon />
          </span>
          <span className="text">
            <span className="row-title">{title}</span>
            {desc ? <span className="row-desc">{desc}</span> : null}
            {sub ? <span className="row-sub">{sub}</span> : null}
          </span>
          <span className="rd-v2-pill muted" title="Assets in this branch">
            {folderSummary.pill}
          </span>
          <span className="rd-v2-catalog-folder-open" aria-hidden="true">→</span>
        </button>
        <FolderDatasetPreview item={item} onSelect={onSelect} />
      </li>
    );
  }

  return (
    <li className={selected ? "rd-v2-row-on" : undefined}>
      <button
        type="button"
        className={`row${selected ? " selected" : ""}${external ? " rd-v2-row-ext" : ""}`}
        data-kind={kind}
        onClick={() => onSelect(dataset)}
        onDoubleClick={() => {
          if (onDoubleClick) onDoubleClick(dataset);
        }}
      >
        <span className={`rd-v2-row-icon${external ? " source" : ""}`}>
          {external ? (
            <SourceRibbon source={dataset.source || dataset.collect_via || dataset.source_route} />
          ) : isScholarly ? (
            <ScholarlyWorkIcon />
          ) : (
            <DatasetIcon />
          )}
        </span>
        <span className="text">
          <span className="row-title">{title}</span>
          {pathLabel ? <span className="row-desc rd-v2-row-path">{pathLabel}</span> : null}
          {desc ? <span className="row-desc">{desc}</span> : null}
          {sub ? <span className="row-sub">{sub}</span> : null}
        </span>
        {state ? (
          <span className={`rd-v2-pill ${state.className}`}>{state.label}</span>
        ) : null}
        {!state ? <StatusPill dataset={dataset} label={statusPill(dataset)} /> : null}
      </button>
    </li>
  );
}

import { statusPill, displayName, libraryAssetKind, rowSubtitle } from "@/v2/datasetMeta";
import { datasetBrowsePathLabel, folderBrowseSummary } from "@/v2/folderBrowseSummary";
import { StatusPill } from "@/v2/StatusPill";
import { SourceRibbon } from "@/v2/ui";

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

export function CatalogRow({
  item,
  selected,
  onSelect,
  onSelectRemoteFile,
  onOpenFolder,
  onDoubleClick,
  external = false,
  compact = false,
  rowState,
}) {
  const isFolder = item.kind === "folder";
  const isRemoteFile = item.kind === "remote_file";
  const dataset = item.row || item;
  const assetKind = isFolder ? "folder" : isRemoteFile ? "remote_file" : libraryAssetKind(dataset);
  const isScholarly = assetKind === "scholarly_work";
  const title = isFolder || isRemoteFile ? item.name : displayName(dataset);
  const folderSummary = isFolder ? (item.remoteSummary || folderBrowseSummary(item)) : null;
  const pathLabel = !isFolder ? datasetBrowsePathLabel(item) : "";
  const sub = isFolder
    ? folderSummary.sub
    : isRemoteFile
      ? [item.providerLabel, item.path || item.mimeType].filter(Boolean).join(" · ")
      : isScholarly
        ? scholarlySubtitle(dataset)
        : rowSubtitle(dataset);
  const desc = isFolder
    ? folderSummary.desc
    : isRemoteFile
      ? (item.contentAccess === "restricted" ? "Metadata is visible, but this account cannot read the file content." : null)
      : compact
        ? null
        : datasetDescription(dataset);
  const state = !isFolder && !isRemoteFile && rowState ? rowState(dataset) : null;
  const kind = isFolder ? "folder" : isRemoteFile ? "remote-file" : external ? "external" : assetKind.replace(/_/g, "-");

  return (
    <li className={selected ? "rd-v2-row-on" : undefined}>
      <button
        type="button"
        className={`row${selected ? " selected" : ""}${external ? " rd-v2-row-ext" : ""}`}
        data-kind={kind}
        disabled={isRemoteFile && !onSelectRemoteFile}
        onClick={() => (isFolder ? onOpenFolder(item) : isRemoteFile ? onSelectRemoteFile?.(item) : onSelect(dataset))}
        onDoubleClick={() => {
          if (!isFolder && !isRemoteFile && onDoubleClick) onDoubleClick(dataset);
        }}
      >
        <span className={`rd-v2-row-icon${external ? " source" : ""}`}>
          {external ? (
            <SourceRibbon source={dataset.source || dataset.collect_via || dataset.source_route} />
          ) : isFolder ? (
            <FolderRowIcon />
          ) : isRemoteFile ? (
            <ScholarlyWorkIcon />
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
        {!isFolder && !isRemoteFile && state ? (
          <span className={`rd-v2-pill ${state.className}`}>{state.label}</span>
        ) : null}
        {!isFolder && !isRemoteFile && !state ? <StatusPill dataset={dataset} label={statusPill(dataset)} /> : null}
        {isRemoteFile ? (
          <span className={`rd-v2-pill ${item.contentAccess === "restricted" ? "warn" : "muted"}`}>
            {item.contentAccess === "restricted" ? "No access" : "Not in Library"}
          </span>
        ) : null}
        {isFolder ? (
          <span className="rd-v2-pill muted" title="Assets in this branch">
            {folderSummary.pill}
          </span>
        ) : null}
      </button>
    </li>
  );
}

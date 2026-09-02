import { LIBRARY_FOLDERS_ROOT } from "@/driveTree";
import {
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

function pluralCount(value, singular, plural = `${singular}s`) {
  const count = Number(value || 0);
  return `${count} ${count === 1 ? singular : plural}`;
}

function isFilteredRoot(folder) {
  if (folder?.folderId) return false;
  const note = String(folder?.note || "").toLowerCase();
  return note.includes("match") && (note.includes("search") || note.includes("matching asset"));
}

function folderDepth(object) {
  return String(object?.path || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean).length - 1;
}

export function LibraryFolderRailPanel({
  object,
  onAskAbout,
  onStartUpload,
  onStartUrl,
  onStartProcure,
}) {
  if (object?.kind !== "library_folder") return null;

  const counts = object.counts || {};
  const root = !object.folderId;
  const foldersRoot = object.folderId === LIBRARY_FOLDERS_ROOT;
  const filteredRoot = isFilteredRoot(object);
  const depth = Math.max(0, folderDepth(object));
  const collection = !root && !foldersRoot && depth === 2;
  const totalAssets = Number(counts.datasets || 0);
  const scopedRows = Number(counts.items || 0);
  const notReady = Math.max(0, totalAssets - Number(counts.queryReady || 0));

  const summaryLabel = filteredRoot
    ? "Filtered Library view"
    : root
      ? "Library overview"
      : foldersRoot
        ? "Folder storage"
        : collection
          ? "Collection"
          : "Folder";

  const legacySummaryLabel = filteredRoot
    ? "In this view"
    : root
      ? "In this library"
      : foldersRoot
        ? "In folder storage"
        : "In this collection";

  const structureLabel = root
    ? "Collections"
    : foldersRoot
      ? "Top-level folders"
      : "Child folders";

  const purpose = filteredRoot
    ? "This view reflects the current Library search and filters across held evidence. Clear them to return to the full overview."
    : root
      ? "Search and review evidence across the full Library. Open Folders when you want to browse the storage structure manually."
      : foldersRoot
        ? "Manual storage browser. Open a top-level folder to move deeper; return to Library for cross-estate retrieval and recommendations."
        : collection
          ? "Research collection inside Folders. Open a child folder to reach its stored evidence, or use the breadcrumb to move back up."
          : "Storage folder. Select evidence here, narrow it with the Library controls, or use the breadcrumb to move back up.";

  const askLabel = root
    ? "Ask about the library →"
    : foldersRoot
      ? "Ask about folders →"
      : collection
        ? "Ask about this collection →"
        : "Ask about this folder →";

  return (
    <RailFrame>
      <div className="rd-v2-rail-scroll rd-v2-library-folder-inspector">
        <section className="rd-v2-library-folder-summary">
          <span hidden>{legacySummaryLabel}</span>
          <p className="rd-v2-rail-section-label">{summaryLabel}</p>
          <h3>{pluralCount(totalAssets, "asset")}</h3>
          <div className="rd-v2-library-folder-readiness">
            {counts.queryReady > 0 ? <span><b>{counts.queryReady}</b> query ready</span> : null}
            {notReady > 0 ? <span><b>{notReady}</b> not query-ready</span> : null}
            {counts.connected > 0 ? <span><b>{counts.connected}</b> connected</span> : null}
            {counts.metadataOnly > 0 ? <span><b>{counts.metadataOnly}</b> metadata only</span> : null}
            {counts.references > 0 ? (
              <span>
                <b>{counts.references}</b> registry reference{counts.references === 1 ? "" : "s"} {counts.references === 1 ? "stays" : "stay"} in Discover until acquired
              </span>
            ) : null}
          </div>
        </section>

        <section className="rd-v2-library-folder-context" aria-label="Library browse context">
          <p className="rd-v2-rail-section-label">Scope &amp; location</p>
          <RailFieldGrid>
            <RailField label="Location" value={object.path || object.destination || "Library"} />
            <RailField label={structureLabel} value={pluralCount(counts.folders, root ? "collection" : "folder")} />
            <RailField label="Rows after filters" value={String(scopedRows)} />
          </RailFieldGrid>
          <p className="rd-v2-rail-note">{purpose}</p>
        </section>

        <section className="rd-v2-library-folder-add">
          <p className="rd-v2-rail-section-label">Add evidence</p>
          {onStartUpload ? <button type="button" onClick={() => onStartUpload(object)}>Upload file</button> : null}
          {onStartUrl ? <button type="button" onClick={() => onStartUrl(object)}>Add URL / DOI</button> : null}
          {onStartProcure ? <button type="button" onClick={() => onStartProcure(object)}>Find missing evidence</button> : null}
        </section>

        <details className="rd-v2-library-inspector-tech rd-v2-library-folder-tech">
          <summary>Technical details</summary>
          <div className="rd-v2-library-inspector-tech-body">
            <RailFieldGrid>
              <RailField label="Destination" value={object.destination} />
              <RailField label="Items" value={pluralCount(counts.items, "item")} />
            </RailFieldGrid>
          </div>
        </details>
      </div>

      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm primary" onClick={onAskAbout}>
          {askLabel}
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}
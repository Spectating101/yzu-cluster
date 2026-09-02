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
  const filteredRoot = isFilteredRoot(object);
  const totalAssets = Number(counts.datasets || 0);
  const visibleItems = Number(counts.items || 0);
  const notReady = Math.max(0, totalAssets - Number(counts.queryReady || 0));
  const summaryLabel = filteredRoot
    ? "In this view"
    : root
      ? "In this library"
      : "In this collection";

  return (
    <RailFrame>
      <div className="rd-v2-rail-scroll rd-v2-library-folder-inspector">
        <section className="rd-v2-library-folder-summary">
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
          <p className="rd-v2-rail-section-label">Current scope</p>
          <RailFieldGrid>
            <RailField label="Location" value={object.path || object.destination || "Library"} />
            <RailField label={root ? "Collections" : "Folders"} value={pluralCount(counts.folders, root ? "collection" : "folder")} />
            <RailField label="Rows in view" value={String(visibleItems)} />
          </RailFieldGrid>
          {object.note ? <p className="rd-v2-rail-note">{object.note}</p> : null}
          <p className="rd-v2-rail-note">
            {root
              ? "Use the Collections row in the main workspace to enter a folder; the breadcrumb returns to all Library evidence."
              : "This is the folder directory. Open a child folder or use the breadcrumb to move back through the Library."}
          </p>
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
          {root ? "Ask about the library →" : "Ask about this collection →"}
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}

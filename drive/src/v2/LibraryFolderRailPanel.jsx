import {
  RailEntityHeader,
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
  const description = filteredRoot
    ? object.note || "This is the current filtered Library view."
    : root
      ? "Your owned data estate and acquisition memory."
      : object.note || "Datasets and research assets organized in this collection.";
  const summaryLabel = filteredRoot
    ? "In this view"
    : root
      ? "In this library"
      : "In this collection";

  return (
    <RailFrame>
      <RailEntityHeader
        id={object.id}
        title={object.title || (root ? "Library" : "Library collection")}
        description={description}
        pills={<span className="rd-v2-pill lab">{filteredRoot ? "Filtered view" : root ? "Library" : "Collection"}</span>}
      />

      <div className="rd-v2-rail-scroll rd-v2-library-folder-inspector">
        <section className="rd-v2-library-folder-summary">
          <p className="rd-v2-rail-section-label">{summaryLabel}</p>
          <h3>{pluralCount(counts.datasets, root ? "asset" : "dataset")}</h3>
          <div className="rd-v2-library-folder-readiness">
            {counts.queryReady > 0 ? <span><b>{counts.queryReady}</b> query ready</span> : null}
            {counts.connected > 0 ? <span><b>{counts.connected}</b> connected</span> : null}
            {counts.metadataOnly > 0 ? <span><b>{counts.metadataOnly}</b> metadata only</span> : null}
            {counts.references > 0 ? <span><b>{counts.references}</b> registry reference{counts.references === 1 ? "" : "s"} stay in Discover until acquired</span> : null}
          </div>
        </section>

        <section className="rd-v2-library-folder-add">
          <p className="rd-v2-rail-section-label">Add data</p>
          {onStartUpload ? <button type="button" onClick={() => onStartUpload(object)}>Upload file</button> : null}
          {onStartUrl ? <button type="button" onClick={() => onStartUrl(object)}>Add URL / DOI</button> : null}
          {onStartProcure ? <button type="button" onClick={() => onStartProcure(object)}>Find missing data</button> : null}
        </section>

        <details className="rd-v2-library-inspector-tech rd-v2-library-folder-tech">
          <summary>Technical details</summary>
          <div className="rd-v2-library-inspector-tech-body">
            <RailFieldGrid>
              <RailField label="Destination" value={object.destination} />
              <RailField label="Collections" value={pluralCount(counts.folders, "collection")} />
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

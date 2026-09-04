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

function isPhysicalFolder(folderId = "") {
  const id = String(folderId || "");
  return id === LIBRARY_FOLDERS_ROOT || id.startsWith(`${LIBRARY_FOLDERS_ROOT}/`);
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
  const physicalFolder = isPhysicalFolder(object.folderId);
  const filteredRoot = isFilteredRoot(object);
  const collection = !root && !physicalFolder;
  const providerDirectory = object.browseMode === "provider";
  const providerLabel = object.provider?.label || "Connected storage";
  const providerRoot = providerDirectory && !object.provider?.parentId;
  const totalAssets = Number(counts.datasets || 0);
  const totalFiles = Number(counts.files || 0);
  const unregisteredFiles = Number(counts.unregisteredFiles || 0);
  const scopedRows = Number(counts.items || 0);
  const notReady = Math.max(0, totalAssets - Number(counts.queryReady || 0));

  const summaryLabel = providerDirectory
    ? `${providerLabel} storage`
    : filteredRoot
    ? "Filtered Library view"
    : root
      ? "Library overview"
      : foldersRoot
        ? "Folder storage"
        : physicalFolder
          ? "Folder"
          : "Collection";

  const legacySummaryLabel = filteredRoot
    ? "In this view"
    : root
      ? "In this library"
      : foldersRoot
        ? "In folder storage"
        : physicalFolder
          ? "In this folder"
          : "In this collection";

  const structureLabel = providerDirectory
    ? providerRoot ? "Top-level folders" : "Child folders"
    : root
    ? "Collections"
    : foldersRoot
      ? "Top-level folders"
      : physicalFolder
        ? "Child folders"
        : "Nested context";

  const purpose = providerDirectory
    ? `Connected ${providerLabel} directory. Folder names and paths come from the linked storage account. Files already mapped to Library evidence open the canonical dossier; other files remain provider files until they are explicitly registered.`
    : filteredRoot
    ? "This view reflects the current Library search and filters across held evidence. Clear them to return to the full overview."
    : root
      ? "Search and review evidence across the full Library. Open Folders when you want to browse the recorded storage structure manually."
      : foldersRoot
        ? "Manual storage browser built only from recorded local paths. Open a top-level folder to move deeper; return to Library for cross-estate retrieval and research collections."
        : physicalFolder
          ? "Recorded storage folder. Select evidence here, move deeper through child folders, or use the breadcrumb to move back up."
          : "Research collection. Select evidence in this context, open nested research context where available, or use the breadcrumb to move back up.";

  const askLabel = providerDirectory
    ? providerRoot ? `Ask about ${providerLabel} →` : "Ask about this storage folder →"
    : root
    ? "Ask about the library →"
    : foldersRoot
      ? "Ask about folders →"
      : physicalFolder
        ? "Ask about this folder →"
        : "Ask about this collection →";

  return (
    <RailFrame>
      <div className="rd-v2-rail-scroll rd-v2-library-folder-inspector">
        <section className="rd-v2-library-folder-summary">
          <span hidden>{legacySummaryLabel}</span>
          <p className="rd-v2-rail-section-label">{summaryLabel}</p>
          <h3>{providerDirectory ? pluralCount(totalFiles, "file") : pluralCount(totalAssets, "asset")}</h3>
          <div className="rd-v2-library-folder-readiness">
            {providerDirectory && totalAssets > 0 ? <span><b>{totalAssets}</b> in Library</span> : null}
            {providerDirectory && unregisteredFiles > 0 ? <span><b>{unregisteredFiles}</b> not in Library</span> : null}
            {counts.queryReady > 0 ? <span><b>{counts.queryReady}</b> query ready</span> : null}
            {!providerDirectory && notReady > 0 ? <span><b>{notReady}</b> not query-ready</span> : null}
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
            <RailField
              label={structureLabel}
              value={pluralCount(counts.folders, root ? "collection" : "folder")}
            />
            <RailField label="Rows after filters" value={String(scopedRows)} />
          </RailFieldGrid>
          <p className="rd-v2-rail-note">{purpose}</p>
        </section>

        {!providerDirectory ? (
          <section className="rd-v2-library-folder-add">
            <p className="rd-v2-rail-section-label">Add evidence</p>
            {onStartUpload ? <button type="button" onClick={() => onStartUpload(object)}>Upload file</button> : null}
            {onStartUrl ? <button type="button" onClick={() => onStartUrl(object)}>Add URL / DOI</button> : null}
            {onStartProcure ? <button type="button" onClick={() => onStartProcure(object)}>Find missing evidence</button> : null}
          </section>
        ) : null}

        <details className="rd-v2-library-inspector-tech rd-v2-library-folder-tech">
          <summary>Technical details</summary>
          <div className="rd-v2-library-inspector-tech-body">
            <RailFieldGrid>
              {providerDirectory ? <RailField label="Provider" value={providerLabel} /> : <RailField label="Destination" value={object.destination} />}
              <RailField label="Rows" value={pluralCount(counts.items, "row")} />
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

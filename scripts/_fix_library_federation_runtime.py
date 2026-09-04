from pathlib import Path


def patch(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor for {label}: {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Folder active objects now distinguish provider-directory files from canonical
# Library evidence. This prevents the right rail from calling every remote file
# an asset or assigning query readiness to files that are not in Library.
patch(
    "drive/src/v2/activeObject.js",
    '''  datasetCount = 0,\n  readyCount = 0,\n  connectedCount = 0,''',
    '''  datasetCount = 0,\n  fileCount = 0,\n  knownEvidenceCount = null,\n  unregisteredFileCount = 0,\n  readyCount = 0,\n  connectedCount = 0,''',
    "folder object file counts",
)
patch(
    "drive/src/v2/activeObject.js",
    '''  referenceCount = 0,\n} = {}) {''',
    '''  referenceCount = 0,\n  browseMode = "local",\n  providerId = "",\n  providerLabel = "",\n  providerParentId = "",\n} = {}) {''',
    "folder object provider mode",
)
patch(
    "drive/src/v2/activeObject.js",
    '''    destination: compactText(destination, title),\n    note,\n    counts: {\n      folders: folderCount,\n      datasets: datasetCount,''',
    '''    destination: compactText(destination, title),\n    note,\n    browseMode,\n    provider: browseMode === "provider" ? {\n      id: compactText(providerId),\n      label: compactText(providerLabel, providerId),\n      parentId: compactText(providerParentId),\n    } : null,\n    counts: {\n      folders: folderCount,\n      files: fileCount,\n      datasets: knownEvidenceCount == null ? datasetCount : knownEvidenceCount,\n      unregisteredFiles: unregisteredFileCount,''',
    "folder object provider return",
)

# Feed the remote object its truthful counts and provider identity.
patch(
    "drive/src/v2/LibraryPage.jsx",
    '''        folderCount,\n        datasetCount: browseDatasetCount,\n        readyCount,\n        itemCount: isRoot ? estateRows.length : visibleRows.length,''',
    '''        folderCount,\n        datasetCount: remoteActive ? branchDatasetRows.length : browseDatasetCount,\n        fileCount: remoteActive ? remoteFileCount : 0,\n        knownEvidenceCount: remoteActive ? branchDatasetRows.length : null,\n        unregisteredFileCount: remoteActive ? remoteRows.filter((item) => item.kind === "remote_file").length : 0,\n        readyCount,\n        itemCount: isRoot ? estateRows.length : visibleRows.length,\n        browseMode: remoteActive ? "provider" : "local",\n        providerId: remoteActive ? locationMode : "",\n        providerLabel: remoteActive ? providerLocation?.label || locationMode : "",\n        providerParentId: remoteActive ? remoteDirectory.parentId : "",''',
    "remote branch object truth",
)
patch(
    "drive/src/v2/LibraryPage.jsx",
    '''    [activeTrail, branchNote, browseDatasetCount, destination, estateRows.length, folderCount, folderId, isRoot, readyCount, referenceCount, remoteActive, visibleRows.length],''',
    '''    [activeTrail, branchDatasetRows.length, branchNote, browseDatasetCount, destination, estateRows.length, folderCount, folderId, isRoot, locationMode, providerLocation?.label, readyCount, referenceCount, remoteActive, remoteDirectory.parentId, remoteFileCount, remoteRows, visibleRows.length],''',
    "remote branch object deps",
)

# Toolbar and branch stats describe provider files, not pretend Library assets.
patch(
    "drive/src/v2/LibraryPage.jsx",
    '''              {navigationLoading && !searchActive\n                ? "Organizing collections…"\n                : loading && !vaultDatasets.length ? "Loading Library…" : toolbarCountLabel({\n                searchActive,\n                isRoot,\n                folderCount,\n                datasetCount: browseDatasetCount,\n                visibleCount: isRoot ? estateRows.length : visibleRows.length,\n              })}''',
    '''              {navigationLoading && !searchActive\n                ? "Organizing collections…"\n                : loading && !vaultDatasets.length\n                  ? "Loading Library…"\n                  : remoteActive\n                    ? `${folderCount} ${folderCount === 1 ? "folder" : "folders"} · ${remoteFileCount} ${remoteFileCount === 1 ? "file" : "files"}`\n                    : toolbarCountLabel({\n                        searchActive,\n                        isRoot,\n                        folderCount,\n                        datasetCount: browseDatasetCount,\n                        visibleCount: isRoot ? estateRows.length : visibleRows.length,\n                      })}''',
    "remote toolbar count",
)
patch(
    "drive/src/v2/LibraryPage.jsx",
    '''              <span>\n                {browseDatasetCount} asset{browseDatasetCount === 1 ? "" : "s"}\n                {searchActive ? " matched" : ""}\n              </span>\n              <span>{readyCount} query-ready</span>''',
    '''              <span>\n                {remoteActive\n                  ? `${remoteFileCount} file${remoteFileCount === 1 ? "" : "s"}`\n                  : `${browseDatasetCount} asset${browseDatasetCount === 1 ? "" : "s"}${searchActive ? " matched" : ""}`}\n              </span>\n              <span>{remoteActive ? `${branchDatasetRows.length} in Library` : `${readyCount} query-ready`}</span>''',
    "remote path stats",
)

# Remote provider rail is a truthful storage context, not the local-path rail.
rail = Path("drive/src/v2/LibraryFolderRailPanel.jsx")
text = rail.read_text(encoding="utf-8")
text = text.replace(
    '''  const collection = !root && !physicalFolder;\n  const totalAssets = Number(counts.datasets || 0);\n  const scopedRows = Number(counts.items || 0);\n  const notReady = Math.max(0, totalAssets - Number(counts.queryReady || 0));''',
    '''  const collection = !root && !physicalFolder;\n  const providerDirectory = object.browseMode === "provider";\n  const providerLabel = object.provider?.label || "Connected storage";\n  const providerRoot = providerDirectory && !object.provider?.parentId;\n  const totalAssets = Number(counts.datasets || 0);\n  const totalFiles = Number(counts.files || 0);\n  const unregisteredFiles = Number(counts.unregisteredFiles || 0);\n  const scopedRows = Number(counts.items || 0);\n  const notReady = Math.max(0, totalAssets - Number(counts.queryReady || 0));''',
    1,
)
text = text.replace(
    '''  const summaryLabel = filteredRoot\n    ? "Filtered Library view"''',
    '''  const summaryLabel = providerDirectory\n    ? `${providerLabel} storage`\n    : filteredRoot\n    ? "Filtered Library view"''',
    1,
)
text = text.replace(
    '''  const structureLabel = root\n    ? "Collections"''',
    '''  const structureLabel = providerDirectory\n    ? providerRoot ? "Top-level folders" : "Child folders"\n    : root\n    ? "Collections"''',
    1,
)
text = text.replace(
    '''  const purpose = filteredRoot\n    ? "This view reflects the current Library search and filters across held evidence. Clear them to return to the full overview."''',
    '''  const purpose = providerDirectory\n    ? `Connected ${providerLabel} directory. Folder names and paths come from the linked storage account. Files already mapped to Library evidence open the canonical dossier; other files remain provider files until they are explicitly registered.`\n    : filteredRoot\n    ? "This view reflects the current Library search and filters across held evidence. Clear them to return to the full overview."''',
    1,
)
text = text.replace(
    '''  const askLabel = root\n    ? "Ask about the library →"''',
    '''  const askLabel = providerDirectory\n    ? providerRoot ? `Ask about ${providerLabel} →` : "Ask about this storage folder →"\n    : root\n    ? "Ask about the library →"''',
    1,
)
text = text.replace(
    '''          <h3>{pluralCount(totalAssets, "asset")}</h3>\n          <div className="rd-v2-library-folder-readiness">\n            {counts.queryReady > 0 ? <span><b>{counts.queryReady}</b> query ready</span> : null}\n            {notReady > 0 ? <span><b>{notReady}</b> not query-ready</span> : null}''',
    '''          <h3>{providerDirectory ? pluralCount(totalFiles, "file") : pluralCount(totalAssets, "asset")}</h3>\n          <div className="rd-v2-library-folder-readiness">\n            {providerDirectory && totalAssets > 0 ? <span><b>{totalAssets}</b> in Library</span> : null}\n            {providerDirectory && unregisteredFiles > 0 ? <span><b>{unregisteredFiles}</b> not in Library</span> : null}\n            {counts.queryReady > 0 ? <span><b>{counts.queryReady}</b> query ready</span> : null}\n            {!providerDirectory && notReady > 0 ? <span><b>{notReady}</b> not query-ready</span> : null}''',
    1,
)
text = text.replace(
    '''        <section className="rd-v2-library-folder-add">\n          <p className="rd-v2-rail-section-label">Add evidence</p>\n          {onStartUpload ? <button type="button" onClick={() => onStartUpload(object)}>Upload file</button> : null}\n          {onStartUrl ? <button type="button" onClick={() => onStartUrl(object)}>Add URL / DOI</button> : null}\n          {onStartProcure ? <button type="button" onClick={() => onStartProcure(object)}>Find missing evidence</button> : null}\n        </section>''',
    '''        {!providerDirectory ? (\n          <section className="rd-v2-library-folder-add">\n            <p className="rd-v2-rail-section-label">Add evidence</p>\n            {onStartUpload ? <button type="button" onClick={() => onStartUpload(object)}>Upload file</button> : null}\n            {onStartUrl ? <button type="button" onClick={() => onStartUrl(object)}>Add URL / DOI</button> : null}\n            {onStartProcure ? <button type="button" onClick={() => onStartProcure(object)}>Find missing evidence</button> : null}\n          </section>\n        ) : null}''',
    1,
)
text = text.replace(
    '''              <RailField label="Destination" value={object.destination} />\n              <RailField label="Items" value={pluralCount(counts.items, "item")} />''',
    '''              {providerDirectory ? <RailField label="Provider" value={providerLabel} /> : <RailField label="Destination" value={object.destination} />}\n              <RailField label="Rows" value={pluralCount(counts.items, "row")} />''',
    1,
)
rail.write_text(text, encoding="utf-8")

# The first run proved the UI state before hitting only an ambiguous test selector.
# Target the actual folder row, not every path string containing “My Drive”.
test = Path("e2e/library-federation-runtime.spec.js")
text = test.read_text(encoding="utf-8")
text = text.replace(
    'await page.getByRole("button", { name: /My Drive/ }).click();',
    'await page.locator(\'button.row[data-kind="folder"]\').filter({ hasText: "My Drive" }).click();',
    1,
)
test.write_text(text, encoding="utf-8")

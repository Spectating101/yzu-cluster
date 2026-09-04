from pathlib import Path

page = Path('drive/src/v2/LibraryPage.jsx')
text = page.read_text()

import_anchor = 'import { libraryVerification } from "@/v2/libraryVerification";\n'
import_line = 'import { isBrowsableLibraryLocation, libraryLocationStatusLabel, normalizeLibraryLocations } from "@/v2/libraryLocations";\n'
if import_line not in text:
    if import_anchor not in text:
        raise SystemExit('LibraryPage import anchor missing')
    text = text.replace(import_anchor, import_anchor + import_line, 1)

props_anchor = '  selectionFallback,\n  referenceCount = 0,\n}) {'
props_repl = '  selectionFallback,\n  folderLocations = [],\n  onFolderLocationChange,\n  referenceCount = 0,\n}) {'
if props_repl not in text:
    if props_anchor not in text:
        raise SystemExit('LibraryPage props anchor missing')
    text = text.replace(props_anchor, props_repl, 1)

browse_anchor = '  const browsingPhysicalFolders = folderId === LIBRARY_FOLDERS_ROOT || String(folderId || "").startsWith(`${LIBRARY_FOLDERS_ROOT}/`);\n\n  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);'
browse_repl = '''  const browsingPhysicalFolders = folderId === LIBRARY_FOLDERS_ROOT || String(folderId || "").startsWith(`${LIBRARY_FOLDERS_ROOT}/`);\n  const normalizedFolderLocations = useMemo(\n    () => normalizeLibraryLocations(folderLocations),\n    [folderLocations],\n  );\n\n  useEffect(() => {\n    if (locationMode === "all") return;\n    const active = normalizedFolderLocations.find((location) => location.id === locationMode);\n    if (!isBrowsableLibraryLocation(active, Boolean(onFolderLocationChange))) setLocationMode("all");\n  }, [locationMode, normalizedFolderLocations, onFolderLocationChange]);\n\n  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);'''
if browse_repl not in text:
    if browse_anchor not in text:
        raise SystemExit('LibraryPage browse anchor missing')
    text = text.replace(browse_anchor, browse_repl, 1)

old_control = '''              {browsingPhysicalFolders ? (\n                <label\n                  className="rd-v2-library-filter-control rd-v2-library-location-filter"\n                  title="Connect external storage accounts in Settings to browse their indexed folders."\n                >\n                  <span>Location</span>\n                  <select\n                    data-testid="library-location-filter"\n                    aria-label="Filter folders by connected location"\n                    value={locationMode}\n                    onChange={(event) => setLocationMode(event.target.value)}\n                  >\n                    <option value="all">All</option>\n                    <option value="google_drive" disabled>Google Drive</option>\n                    <option value="dropbox" disabled>Dropbox</option>\n                  </select>\n                </label>\n              ) : null}'''
new_control = '''              {browsingPhysicalFolders ? (\n                <div\n                  className="rd-v2-library-filter-control rd-v2-library-location-filter"\n                  data-testid="library-location-filter"\n                  aria-label="Folder storage location"\n                >\n                  <span>Location</span>\n                  <div className="rd-v2-library-location-options" role="group" aria-label="Browse folder storage location">\n                    {normalizedFolderLocations.map((location) => {\n                      const browsable = isBrowsableLibraryLocation(location, Boolean(onFolderLocationChange));\n                      const active = location.id === locationMode;\n                      const status = libraryLocationStatusLabel(location);\n                      return (\n                        <button\n                          key={location.id}\n                          type="button"\n                          className={active ? "active" : ""}\n                          data-location={location.id}\n                          data-state={location.state}\n                          aria-pressed={active}\n                          disabled={!browsable}\n                          title={location.id === "all" ? "Browse all available folder locations" : `${location.label} · ${status}`}\n                          onClick={() => {\n                            setLocationMode(location.id);\n                            onFolderLocationChange?.(location.id);\n                          }}\n                        >\n                          {location.label}\n                        </button>\n                      );\n                    })}\n                  </div>\n                </div>\n              ) : null}'''
if new_control not in text:
    if old_control not in text:
        raise SystemExit('LibraryPage old location control missing')
    text = text.replace(old_control, new_control, 1)

page.write_text(text)

css = Path('drive/src/v2/library-live-scale.css')
styles = css.read_text()
marker = '/* LIBRARY FEDERATION FREEZE: visible provider location chrome */'
if marker not in styles:
    styles += r'''

/* LIBRARY FEDERATION FREEZE: visible provider location chrome
   External stores remain discoverable while disconnected; real account truth
   only enables them once a provider directory adapter is ready. */
.rd-v2-library-location-filter {
  min-width: 0;
}

.rd-v2-library-location-options {
  display: inline-flex;
  min-height: 28px;
  overflow: hidden;
  border: 1px solid var(--rd-border2);
  border-radius: 6px;
  background: rgba(250, 249, 244, .6);
}

.rd-v2-library-location-options button {
  min-width: 0;
  padding: 0 9px;
  border: 0;
  border-left: 1px solid var(--rd-border);
  background: transparent;
  color: var(--rd-body);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}

.rd-v2-library-location-options button:first-child {
  border-left: 0;
}

.rd-v2-library-location-options button.active {
  background: var(--rd-active-bg);
  color: var(--rd-text);
  font-weight: 700;
}

.rd-v2-library-location-options button:disabled {
  color: rgba(91, 101, 114, .38);
  cursor: default;
  opacity: 1;
}

.rd-v2-library-location-options button[data-state="indexing"]:disabled,
.rd-v2-library-location-options button[data-state="error"]:disabled {
  color: rgba(91, 101, 114, .52);
}

@media (max-width: 760px) {
  .rd-v2-library-location-filter {
    width: 100%;
  }

  .rd-v2-library-location-options {
    width: 100%;
  }

  .rd-v2-library-location-options button {
    flex: 1 1 auto;
    padding-inline: 7px;
  }
}
'''
    css.write_text(styles)

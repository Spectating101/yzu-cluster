from pathlib import Path

p = Path('drive/src/v2/LibraryPage.jsx')
s = p.read_text()
needle = '  const [filterMode, setFilterMode] = useState("all");\n  const [newMenuOpen, setNewMenuOpen] = useState(false);'
repl = '  const [filterMode, setFilterMode] = useState("all");\n  const [locationMode, setLocationMode] = useState("all");\n  const [newMenuOpen, setNewMenuOpen] = useState(false);'
assert needle in s
s = s.replace(needle, repl, 1)
needle = '  const isRoot = !folderId;\n\n  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);'
repl = '  const isRoot = !folderId;\n  const browsingPhysicalFolders = folderId === LIBRARY_FOLDERS_ROOT || String(folderId || "").startsWith(`${LIBRARY_FOLDERS_ROOT}/`);\n\n  const items = useMemo(() => listFolderChildren(tree, folderId), [tree, folderId]);'
assert needle in s
s = s.replace(needle, repl, 1)
needle = '''              <label className="rd-v2-library-filter-control">\n                <span>Sort</span>\n                <select\n                  data-testid="library-sort-filter"\n                  aria-label="Sort Library"\n                  value={sortBy}\n                  onChange={(event) => setSortBy(event.target.value)}\n                >\n                  {searchActive ? <option value="relevance">Relevance</option> : null}\n                  <option value="name">Name</option>\n                  <option value="updated">Modified</option>\n                </select>\n              </label>'''
repl = needle + '''\n              {browsingPhysicalFolders ? (\n                <label\n                  className="rd-v2-library-filter-control rd-v2-library-location-filter"\n                  title="Connect external storage accounts in Settings to browse their indexed folders."\n                >\n                  <span>Location</span>\n                  <select\n                    data-testid="library-location-filter"\n                    aria-label="Filter folders by connected location"\n                    value={locationMode}\n                    onChange={(event) => setLocationMode(event.target.value)}\n                  >\n                    <option value="all">All</option>\n                    <option value="google_drive" disabled>Google Drive</option>\n                    <option value="dropbox" disabled>Dropbox</option>\n                  </select>\n                </label>\n              ) : null}'''
assert needle in s
s = s.replace(needle, repl, 1)
p.write_text(s)

css = Path('drive/src/v2/library-live-scale.css')
t = css.read_text()
marker = '/* LIBRARY FINAL FREEZE: disconnected external folder locations */'
if marker not in t:
    t += '''\n\n/* LIBRARY FINAL FREEZE: disconnected external folder locations\n   Keep supported providers visible in ordinary toolbar chrome without claiming OAuth access. */\n.rd-v2-library-location-filter select:has(option:disabled) {\n  min-width: 92px;\n}\n\n.rd-v2-library-location-filter select option:disabled {\n  color: var(--rd-muted);\n}\n'''
    css.write_text(t)

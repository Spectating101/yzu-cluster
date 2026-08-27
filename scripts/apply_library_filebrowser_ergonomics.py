from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# LibraryPage: one coherent Type / State / Sort grammar plus keyboard-first search.
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    'import { statusPillKind } from "@/v2/datasetMeta";\n',
    'import { libraryAssetPresentation, statusPillKind } from "@/v2/datasetMeta";\nimport { libraryVerification } from "@/v2/libraryVerification";\n',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''function itemMatchesFilter(item, mode) {
  if (mode === "all" || item?.kind === "folder") return true;
  const row = itemDataset(item);
  const ready = statusPillKind(row).kind === "query-ready";
  if (mode === "ready") return ready;
  if (mode === "not_ready") return !ready;
  return true;
}
''',
    '''function itemPresentationKind(item) {
  if (item?.kind === "folder") return "folder";
  return libraryAssetPresentation(itemDataset(item)).kind;
}

function itemMatchesType(item, mode) {
  if (mode === "all" || item?.kind === "folder") return true;
  const kind = itemPresentationKind(item);
  if (mode === "data") return kind === "dataset" || kind === "metadata_index";
  if (mode === "literature") return kind === "scholarly_work";
  if (mode === "sources") return kind === "live_source";
  return true;
}

function itemNeedsAttention(item) {
  if (item?.kind === "folder") return false;
  const row = itemDataset(item);
  const readiness = statusPillKind(row).kind;
  const verification = libraryVerification(row).kind;
  return readiness !== "query-ready" || !["verified", "matched"].includes(verification);
}

function itemMatchesFilter(item, mode) {
  if (mode === "all" || item?.kind === "folder") return true;
  const row = itemDataset(item);
  const ready = statusPillKind(row).kind === "query-ready";
  if (mode === "ready") return ready;
  if (mode === "not_ready") return !ready;
  if (mode === "attention") return itemNeedsAttention(item);
  return true;
}
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  onClearSelection,
  onAskDataset,
  onAskSearch,
  searchQuery = "",
''',
    '''  onClearSelection,
  onAskDataset,
  onAskSearch,
  onReviewAvailable,
  onSearchWider,
  searchQuery = "",
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const [sortBy, setSortBy] = useState("name");
  const [filterMode, setFilterMode] = useState("all");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const searchActive = Boolean(String(searchQuery || "").trim());
''',
    '''  const [sortBy, setSortBy] = useState("name");
  const [typeMode, setTypeMode] = useState("all");
  const [filterMode, setFilterMode] = useState("all");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchActive = Boolean(String(searchQuery || "").trim());
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  useEffect(() => {
    if (searchActive) {
      setSortBy((current) => (current === "name" ? "relevance" : current));
    } else {
      setSortBy((current) => (current === "relevance" ? "name" : current));
    }
  }, [searchActive]);
''',
    '''  useEffect(() => {
    if (searchActive) {
      setSortBy((current) => (current === "name" ? "relevance" : current));
    } else {
      setSortBy((current) => (current === "relevance" ? "name" : current));
    }
  }, [searchActive]);

  useEffect(() => {
    const focusLibrarySearch = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", focusLibrarySearch);
    return () => window.removeEventListener("keydown", focusLibrarySearch);
  }, []);
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const visibleRows = useMemo(
    () => sortItems(displayRows.filter((item) => itemMatchesFilter(item, filterMode)), sortBy),
    [displayRows, filterMode, sortBy],
  );
''',
    '''  const visibleRows = useMemo(
    () =>
      sortItems(
        displayRows.filter(
          (item) => itemMatchesType(item, typeMode) && itemMatchesFilter(item, filterMode),
        ),
        sortBy,
      ),
    [displayRows, filterMode, sortBy, typeMode],
  );
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const estateRows = useMemo(
    () => sortItems(branchDatasetRows.map(datasetListItem).filter((item) => itemMatchesFilter(item, filterMode)), sortBy),
    [branchDatasetRows, filterMode, sortBy],
  );
''',
    '''  const estateRows = useMemo(
    () =>
      sortItems(
        branchDatasetRows
          .map(datasetListItem)
          .filter((item) => itemMatchesType(item, typeMode) && itemMatchesFilter(item, filterMode)),
        sortBy,
      ),
    [branchDatasetRows, filterMode, sortBy, typeMode],
  );
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const readyCount = readinessCount(branchDatasetRows);
  const nonReadyCount = Math.max(0, branchDatasetRows.length - readyCount);
  const browseDatasetCount = branchDatasetRows.length;
''',
    '''  const readyCount = readinessCount(branchDatasetRows);
  const nonReadyCount = Math.max(0, branchDatasetRows.length - readyCount);
  const attentionCount = branchDatasetRows.filter((row) => itemNeedsAttention(datasetListItem(row))).length;
  const browseDatasetCount = branchDatasetRows.length;
''',
)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''  const askCurrentSearch = useCallback(() => {
    const query = String(searchQuery || "").trim();
    if (!query || !onAskSearch) return;
    onClearSelection?.();
    onAskSearch(buildLibrarySearchAskPrompt(query, branchDatasetRows));
  }, [branchDatasetRows, onAskSearch, onClearSelection, searchQuery]);

  return (
''',
    '''  const askCurrentSearch = useCallback(() => {
    const query = String(searchQuery || "").trim();
    if (!query || !onAskSearch) return;
    onClearSelection?.();
    onAskSearch(buildLibrarySearchAskPrompt(query, branchDatasetRows));
  }, [branchDatasetRows, onAskSearch, onClearSelection, searchQuery]);

  const resetFilters = useCallback(() => {
    setTypeMode("all");
    setFilterMode("all");
  }, []);

  return (
''',
)

old_toolbar = '''            <label className="rd-v2-library-toolbar-search" data-testid="library-toolbar-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m21 21-4.2-4.2m1.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search title, field, source, coverage…"
                aria-label="Search library holdings"
                onKeyDown={(e) => {
                  // Live filter; Enter just commits focus so results stay visible.
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
            {searchActive && onAskSearch ? (
              <button
                type="button"
                className="rd-v2-btn sm rd-v2-library-search-ask"
                data-testid="library-search-ask"
                onClick={askCurrentSearch}
              >
                Ask Library
              </button>
            ) : null}
            {searchActive ? (
              <Chip active={sortBy === "relevance"} onClick={() => setSortBy("relevance")}>
                Relevance
              </Chip>
            ) : null}
            <Chip active={sortBy === "name"} onClick={() => setSortBy("name")}>
              Name {sortBy === "name" ? "↑" : "↕"}
            </Chip>
            <Chip active={sortBy === "updated"} onClick={() => setSortBy("updated")}>
              Modified {sortBy === "updated" ? "↓" : "↕"}
            </Chip>
            <Chip active={filterMode === "all"} onClick={() => setFilterMode("all")}>
              All
            </Chip>
            <Chip active={filterMode === "ready"} onClick={() => setFilterMode("ready")}>
              Query ready {readyCount}
            </Chip>
            <Chip active={filterMode === "not_ready"} onClick={() => setFilterMode("not_ready")}>
              Not query-ready {nonReadyCount}
            </Chip>
'''
new_toolbar = '''            <label className="rd-v2-library-toolbar-search" data-testid="library-toolbar-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m21 21-4.2-4.2m1.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search title, field, source, coverage…"
                aria-label="Search library holdings"
                aria-keyshortcuts="/"
                onKeyDown={(e) => {
                  // Live filter; Enter commits focus so arrow navigation can take over.
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              <kbd aria-hidden="true">/</kbd>
            </label>
            {searchActive && onAskSearch ? (
              <button
                type="button"
                className="rd-v2-btn sm rd-v2-library-search-ask"
                data-testid="library-search-ask"
                onClick={askCurrentSearch}
              >
                Ask Library
              </button>
            ) : null}
            <div className="rd-v2-library-toolbar-filters" aria-label="Library filters">
              <label className="rd-v2-library-filter-control">
                <span>Type</span>
                <select
                  data-testid="library-type-filter"
                  aria-label="Filter Library by type"
                  value={typeMode}
                  onChange={(event) => setTypeMode(event.target.value)}
                >
                  <option value="all">Everything</option>
                  <option value="data">Data</option>
                  <option value="literature">Literature</option>
                  <option value="sources">Live sources</option>
                </select>
              </label>
              <label className="rd-v2-library-filter-control">
                <span>State</span>
                <select
                  data-testid="library-state-filter"
                  aria-label="Filter Library by state"
                  value={filterMode}
                  onChange={(event) => setFilterMode(event.target.value)}
                >
                  <option value="all">Any</option>
                  <option value="ready">Query ready · {readyCount}</option>
                  <option value="attention">Needs attention · {attentionCount}</option>
                  <option value="not_ready">Not query-ready · {nonReadyCount}</option>
                </select>
              </label>
              <label className="rd-v2-library-filter-control">
                <span>Sort</span>
                <select
                  data-testid="library-sort-filter"
                  aria-label="Sort Library"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  {searchActive ? <option value="relevance">Relevance</option> : null}
                  <option value="name">Name</option>
                  <option value="updated">Modified</option>
                </select>
              </label>
            </div>
'''
replace_once("drive/src/v2/LibraryPage.jsx", old_toolbar, new_toolbar)
replace_once(
    "drive/src/v2/LibraryPage.jsx",
    '''              referenceCount={searchActive ? 0 : referenceCount}
              onOpenCollection={(collection) => onFolderChange(collection.id)}
              onReviewAvailable={onStartProcure ? handleProcureBranch : undefined}
              onSelectDataset={onSelectDataset}
              searchQuery={searchQuery}
''',
    '''              referenceCount={searchActive ? 0 : referenceCount}
              onOpenCollection={(collection) => onFolderChange(collection.id)}
              onReviewAvailable={onReviewAvailable}
              onSelectDataset={onSelectDataset}
              searchQuery={searchQuery}
              searchMatchCount={rankedSearchDatasets.length}
              onAskCurrentSearch={onAskSearch ? askCurrentSearch : undefined}
              onSearchWider={onSearchWider}
              onResetFilters={resetFilters}
''',
)

# App: outside-Library evidence and search misses route to Discover, not a fake local folder action.
replace_once(
    "drive/src/v2/App.jsx",
    '''          onAskDataset={canUseAsk ? askAboutLibraryDataset : undefined}
          onAskSearch={canUseAsk ? queueLibraryAsk : undefined}
          onRefresh={refreshBackend}
''',
    '''          onAskDataset={canUseAsk ? askAboutLibraryDataset : undefined}
          onAskSearch={canUseAsk ? queueLibraryAsk : undefined}
          onReviewAvailable={() => {
            setDiscoverSearchQuery("");
            setDiscoverPreferLive(false);
            goTab("browse");
          }}
          onSearchWider={searchDiscoverWider}
          onRefresh={refreshBackend}
''',
)

# Existing journey: pin the unified file-browser grammar instead of the removed duplicate View row.
replace_once(
    "e2e/v2-library.spec.js",
    '''    const catalogue = page.getByTestId("library-auto-catalog");
    await expect(catalogue).toBeVisible();
    await expect(catalogue.getByText("View", { exact: true })).toBeVisible();
    await expect(page.getByTestId("library-evidence-row").first()).toBeVisible();
    await expect(page.getByTestId("library-collection-filter").first()).toBeVisible();
    await expect(estate.getByText("Collections", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^All$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Query ready / })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Not query-ready / })).toBeVisible();
''',
    '''    await expect(page.getByTestId("library-auto-catalog")).toHaveCount(0);
    await expect(page.getByTestId("library-evidence-row").first()).toBeVisible();
    await expect(page.getByTestId("library-collection-filter").first()).toBeVisible();
    await expect(estate.getByText("Collections", { exact: true })).toBeVisible();
    await expect(page.getByTestId("library-type-filter")).toHaveValue("all");
    await expect(page.getByTestId("library-state-filter")).toHaveValue("all");
    await expect(page.getByTestId("library-sort-filter")).toHaveValue("name");
''',
)

# Generalize the existing Library convergence workflow to all hardening Library branches
# and include the retrieval-ergonomics render when present.
workflow = Path(".github/workflows/library-convergence-render.yml")
workflow_text = workflow.read_text(encoding="utf-8")
workflow_text = workflow_text.replace(
    '''    branches:
      - hardening/library-evidence-rigor-20260827
''',
    '''    branches:
      - "hardening/library-*"
''',
    1,
)
workflow_text = workflow_text.replace(
    '''          e2e/library-convergence-render.spec.js
          e2e/library-visual-depth-render.spec.js
          --reporter=line
''',
    '''          e2e/library-convergence-render.spec.js
          e2e/library-visual-depth-render.spec.js
          e2e/library-retrieval-excellence-render.spec.js
          --reporter=line
''',
    1,
)
workflow.write_text(workflow_text, encoding="utf-8")

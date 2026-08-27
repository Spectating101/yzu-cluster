from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected block not found in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) The global Research Situation already owns Library/collection identity.
# The detailed rail should start with useful counts/actions, not repeat the title.
replace_once(
    "drive/src/v2/RailPanels.jsx",
    '''  const counts = folder.counts || {};
  const root = !folder.folderId;
  const desc = root
    ? "Your owned data estate and acquisition memory."
    : folder.note || "Datasets and research assets organized in this collection.";

  return (
    <RailFrame>
      <RailEntityHeader
        title={folder.title}
        description={desc}
        pills={<span className="rd-v2-pill lab">{root ? "Library" : "Collection"}</span>}
      />
      <div className="rd-v2-rail-scroll rd-v2-library-folder-inspector">''',
    '''  const counts = folder.counts || {};
  const root = !folder.folderId;

  return (
    <RailFrame>
      <div className="rd-v2-rail-scroll rd-v2-library-folder-inspector">''',
)

replace_once(
    "drive/src/v2/RailPanels.jsx",
    '''export function PageRailPanel({ page = "home", onAskAbout }) {
  const copy = PAGE_RAIL_COPY[page] || PAGE_RAIL_COPY.home;
  return (
    <RailFrame>
      <RailEntityHeader id={page} title={copy.title} description={copy.desc} />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          {copy.fields.map(([label, value]) => (
            <RailField key={label} label={label} value={value} />
          ))}
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
          Ask about this page →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}''',
    '''export function PageRailPanel({ page = "home", onAskAbout }) {
  const copy = PAGE_RAIL_COPY[page] || PAGE_RAIL_COPY.home;

  if (page === "library") {
    return (
      <RailFrame>
        <div className="rd-v2-rail-scroll rd-v2-library-page-guide">
          <section className="rd-v2-library-folder-summary">
            <p className="rd-v2-rail-section-label">Find held evidence</p>
            <p className="rd-v2-rail-note">
              Search by title, field, source, coverage, or research context, then inspect the result in place.
            </p>
          </section>
          <RailFieldGrid>
            <RailField label="Search" value="Title · field · source · coverage · context" />
            <RailField label="Inspect" value="Preview, readiness, provenance, and Ask stay one selection away" />
            <RailField label="Missing" value="Ask Library or widen the search in Discover" />
          </RailFieldGrid>
        </div>
        <RailStickyFooter>
          <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
            Ask Library →
          </button>
        </RailStickyFooter>
      </RailFrame>
    );
  }

  return (
    <RailFrame>
      <RailEntityHeader id={page} title={copy.title} description={copy.desc} />
      <div className="rd-v2-rail-scroll">
        <RailFieldGrid>
          {copy.fields.map(([label, value]) => (
            <RailField key={label} label={label} value={value} />
          ))}
        </RailFieldGrid>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
          Ask about this page →
        </button>
      </RailStickyFooter>
    </RailFrame>
  );
}''',
)

# 2) The file ledger keeps a stable five-column grammar. Type never disappears
# simply because the current result set happens to contain only datasets.
replace_once(
    "drive/src/v2/LibraryEvidenceEstate.jsx",
    '''  const visibleAssets = assets;
  const showKind = visibleAssets.some((item) => presentationKind(item?.row || item) !== "dataset");
  const ledgerClass = `rd-v2-cap-ledger with-verify${showKind ? " show-kind" : ""}`;''',
    '''  const visibleAssets = assets;
  const showKind = true;
  const ledgerClass = "rd-v2-cap-ledger with-verify show-kind";''',
)

# 3) Selected evidence is an inspector, so its top bar should dismiss like an
# inspector rather than look like a nested Library destination page.
replace_once(
    "drive/src/v2/LibraryAssetWorkspace.jsx",
    '''    <PageShell
      className="rd-v2-library-workspace"
      title="Library"
      lead="Inspect held evidence."
      headExtra={<button type="button" className="rd-v2-btn sm" onClick={onBack}>← All Library assets</button>}
    >''',
    '''    <PageShell
      className="rd-v2-library-workspace"
      headExtra={
        <div className="rd-v2-library-inspector-bar">
          <span className="rd-v2-library-inspector-context"><b>Library</b><span aria-hidden="true">·</span> Inspect</span>
          <button type="button" className="rd-v2-btn sm" onClick={onBack} aria-label="Close asset inspector">Close</button>
        </div>
      }
    >''',
)

# 4) Give search enough permanent width to read as the primary retrieval tool,
# while preserving the compact Type / State / Sort grammar beside it.
replace_once(
    "drive/src/v2/library-evidence-rigor.css",
    '''.rd-v2-library-toolbar-search {
  flex: 1 1 300px;
  min-width: 230px;
}

.rd-v2-library-toolbar-search kbd {''',
    '''.rd-v2-library-page .rd-v2-toolbar {
  gap: 7px;
}

.rd-v2-library-toolbar-search {
  flex: 1 1 330px;
  min-width: 300px;
  max-width: 460px;
}

.rd-v2-library-toolbar-search input {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
}

.rd-v2-library-toolbar-search kbd {''',
)

replace_once(
    "drive/src/v2/library-evidence-rigor.css",
    '''@media (max-width: 1180px) {
  .rd-v2-library-toolbar-filters {
    flex-wrap: wrap;
  }

  .rd-v2-library-filter-control select {
    max-width: 118px;
  }
}''',
    '''@media (min-width: 1500px) {
  .rd-v2-library-toolbar-search {
    max-width: 520px;
  }
}

@media (max-width: 1180px) {
  .rd-v2-library-toolbar-search {
    min-width: 270px;
  }

  .rd-v2-library-toolbar-filters {
    flex-wrap: wrap;
  }

  .rd-v2-library-filter-control select {
    max-width: 118px;
  }
}''',
)

# 5) Tighten the inspector bar itself. The evidence composition below it is
# intentionally unchanged.
replace_once(
    "drive/src/v2/library-workspace.css",
    '''.rd-v2-library-inspector-shell .rd-v2-library-workspace .rd-v2-page-head {
  min-height: 44px;
  align-items: center;
  gap: 12px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--rd-release-line, var(--rd-border));
  background: rgba(250, 249, 243, 0.92);
}

.rd-v2-library-inspector-shell .rd-v2-library-workspace .rd-v2-page-head h1 {
  margin: 0;
  color: var(--rd-muted);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.rd-v2-library-inspector-shell .rd-v2-library-workspace .rd-v2-page-head .rd-v2-lead {
  display: none;
}

.rd-v2-library-inspector-shell .rd-v2-library-workspace .rd-v2-page-head > :last-child {
  margin: 0 0 0 auto;
}''',
    '''.rd-v2-library-inspector-shell .rd-v2-library-workspace .rd-v2-page-head {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--rd-release-line, var(--rd-border));
  background: rgba(250, 249, 243, 0.92);
}

.rd-v2-library-inspector-bar {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rd-v2-library-inspector-context {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--rd-muted);
  font-size: 10.5px;
  line-height: 1;
}

.rd-v2-library-inspector-context b {
  color: var(--rd-text);
  font-weight: 700;
}

.rd-v2-library-inspector-bar .rd-v2-btn {
  min-height: 28px;
  padding: 5px 10px;
}

.rd-v2-library-inspector-shell .rd-v2-library-workspace .rd-v2-page-head > :last-child {
  width: 100%;
  margin: 0;
}''',
)

# Update browser contracts to the inspector's canonical dismiss action.
for test_path in Path("e2e").glob("*.js"):
    text = test_path.read_text(encoding="utf-8")
    if 'name: "← All Library assets"' in text:
        test_path.write_text(text.replace('name: "← All Library assets"', 'name: "Close asset inspector"'), encoding="utf-8")

# Pin the visual-convergence intent: Type remains stable during retrieval and
# root/collection detail panels no longer duplicate the global identity header.
replace_once(
    "e2e/library-retrieval-excellence-render.spec.js",
    '''    await expect(rows.first().getByTestId("library-search-match")).toContainText("field · country_iso3");
    await expect(page.getByTestId("library-sort-filter")).toHaveValue("relevance");''',
    '''    await expect(rows.first().getByTestId("library-search-match")).toContainText("field · country_iso3");
    await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(page.getByTestId("library-sort-filter")).toHaveValue("relevance");''',
)

replace_once(
    "e2e/v2-library.spec.js",
    '''    await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Add evidence");''',
    '''    await expect(page.locator("aside.rd-v2-rail")).toContainText("In this library");
    await expect(page.locator("aside.rd-v2-rail .rd-v2-rail-ehead")).toHaveCount(0);
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Add evidence");''',
)

print("Library final visual-freeze patch applied.")

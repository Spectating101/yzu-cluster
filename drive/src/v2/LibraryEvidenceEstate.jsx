import { useEffect, useMemo, useState } from "react";
import { displayName, libraryAssetPresentation } from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { StatusPill } from "@/v2/StatusPill";
import "@/v2/capability-convergence.css";
import "@/v2/library-evidence-rigor.css";
import "@/v2/library-auto-catalog.css";
import "@/v2/library-coherence-polish.css";

function sourceLabel(row = {}) {
  return String(
    row.source ||
      row.publisher ||
      row.source_system ||
      row.source_route ||
      row.collect_via ||
      row.backend ||
      "Not recorded",
  ).trim();
}

function presentationKind(row = {}) {
  return libraryAssetPresentation(row).kind;
}

function descriptionLabel(row = {}) {
  const explicit = String(
    row.description ||
      row.one_line ||
      row.summary ||
      row.recommended_use ||
      "",
  ).trim();
  if (explicit) return explicit;

  const kind = presentationKind(row);
  const grain = String(row.grain || "").trim();
  const coverage = String(row.coverage || row.date_range || row.temporal_coverage || "").trim();
  const pieces = [];
  if (kind === "scholarly_work") pieces.push("Bibliographic research evidence");
  else if (kind === "metadata_index") pieces.push("Metadata index");
  else if (kind === "live_source") pieces.push("Live research source");
  else if (kind === "operational") pieces.push("Operational research record");
  else pieces.push("Registered research dataset");
  if (grain) pieces.push(`${grain} grain`);
  if (coverage) pieces.push(coverage);
  return pieces.join(" · ");
}

function kindLabel(row = {}) {
  const kind = presentationKind(row);
  if (kind === "scholarly_work") return "Scholarly work";
  if (kind === "metadata_index") return "Metadata index";
  if (kind === "live_source") return "Live source";
  if (kind === "operational") return "Operational";
  return "Dataset";
}

function collectionCount(folder = {}) {
  const direct = Number(folder.dataset_count || folder.asset_count || folder.count || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return Object.values(folder.children || {}).reduce((sum, child) => {
    if (child?.kind === "dataset") return sum + 1;
    if (child?.kind === "folder") return sum + collectionCount(child);
    return sum;
  }, 0);
}

function folderChildren(folder = {}) {
  return Object.values(folder.children || {})
    .filter((child) => child?.kind === "folder")
    .sort((a, b) => {
      const sortDelta = Number(a.sort || 500) - Number(b.sort || 500);
      if (sortDelta) return sortDelta;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    });
}

function moveLedgerFocus(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const table = event.currentTarget.closest('[role="table"]');
  if (!table) return;
  const rows = [...table.querySelectorAll('[data-testid="library-evidence-row"]')];
  if (!rows.length) return;
  const current = rows.indexOf(event.currentTarget);
  let next = current;
  if (event.key === "ArrowDown") next = Math.min(rows.length - 1, current + 1);
  if (event.key === "ArrowUp") next = Math.max(0, current - 1);
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = rows.length - 1;
  event.preventDefault();
  rows[next]?.focus();
}

function LibraryDirectoryNode({
  node,
  depth,
  folderId,
  activePathIds,
  expandedIds,
  onToggleExpanded,
  onOpenCollection,
}) {
  const children = folderChildren(node);
  const expanded = expandedIds.has(node.id);
  const active = folderId === node.id;
  const inPath = activePathIds.has(node.id);
  const testId = depth === 0 ? "library-collection-filter" : "library-directory-branch";

  return (
    <div
      className={`rd-v2-library-navigator-node${active ? " is-active" : ""}${inPath ? " is-in-path" : ""}`}
      data-depth={depth}
    >
      <div
        className="rd-v2-library-navigator-row"
        style={{ "--rd-library-depth": depth }}
      >
        {children.length ? (
          <button
            type="button"
            className="rd-v2-library-navigator-twisty"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name || node.id}`}
            aria-expanded={expanded}
            onClick={() => onToggleExpanded(node.id)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="rd-v2-library-navigator-twisty-spacer" aria-hidden="true">·</span>
        )}
        <button
          type="button"
          className="rd-v2-library-navigator-target"
          data-testid={testId}
          aria-current={active ? "page" : undefined}
          onClick={() => {
            if (children.length && !expanded) onToggleExpanded(node.id, true);
            onOpenCollection?.(node);
          }}
        >
          <span className="rd-v2-library-navigator-copy">
            <strong>{node.name || node.label || node.id}</strong>
            {depth === 0 && node.blurb ? <em>{node.blurb}</em> : null}
          </span>
          <span className="rd-v2-library-navigator-count">{collectionCount(node)}</span>
          <span className="rd-v2-library-navigator-open" aria-hidden="true">Open</span>
        </button>
      </div>
      {children.length && expanded ? (
        <div className="rd-v2-library-navigator-children">
          {children.map((child) => (
            <LibraryDirectoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              folderId={folderId}
              activePathIds={activePathIds}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              onOpenCollection={onOpenCollection}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LibraryNavigator({
  collections,
  collectionsLoading,
  folderId,
  trail,
  filterMode,
  totalAssetCount,
  totalReadyCount,
  totalReviewCount,
  totalAttentionCount,
  onOpenCollection,
  onOpenRoot,
  onChooseSmartView,
}) {
  const activePathIds = useMemo(
    () => new Set((trail || []).map((item) => item?.id).filter(Boolean)),
    [trail],
  );
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => {
    const ids = (trail || []).map((item) => item?.id).filter(Boolean);
    if (!ids.length) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [trail]);

  const toggleExpanded = (id, forceOpen = false) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (forceOpen) next.add(id);
      else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chooseSmartView = (mode) => {
    onOpenRoot?.();
    onChooseSmartView?.(mode);
  };

  const allSelected = !folderId && filterMode === "all";
  const reviewSelected = !folderId && filterMode === "review";
  const readySelected = !folderId && filterMode === "ready";
  const attentionSelected = !folderId && filterMode === "attention";

  return (
    <section
      className="rd-v2-library-directory-home rd-v2-library-navigator"
      aria-label="Library directory"
      data-testid="library-directory-home"
    >
      <header className="rd-v2-library-directory-intro">
        <div>
          <span className="rd-v2-library-directory-kicker">Collections</span>
          <h2>Library navigator</h2>
          <p>Choose a scope. The evidence pane updates without leaving the browser.</p>
        </div>
        <div className="rd-v2-library-directory-summary" aria-label="Library directory summary">
          <span><b>{collections.length}</b> research area{collections.length === 1 ? "" : "s"}</span>
          <span><b>{totalAssetCount}</b> evidence asset{totalAssetCount === 1 ? "" : "s"}</span>
        </div>
      </header>

      <nav className="rd-v2-library-navigator-body" aria-label="Library scopes and smart views">
        <div className="rd-v2-library-navigator-section">
          <span className="rd-v2-library-navigator-section-label">Library</span>
          <button
            type="button"
            className={`rd-v2-library-navigator-view${allSelected ? " is-active" : ""}`}
            data-testid="library-navigator-all"
            aria-current={allSelected ? "page" : undefined}
            onClick={() => chooseSmartView("all")}
          >
            <span>
              <strong>All evidence</strong>
              <em>Everything held in this Library</em>
            </span>
            <b>{totalAssetCount}</b>
          </button>
        </div>

        <div className="rd-v2-library-navigator-section">
          <span className="rd-v2-library-navigator-section-label">Smart views</span>
          <button
            type="button"
            className={`rd-v2-library-navigator-view${reviewSelected ? " is-active" : ""}`}
            data-testid="library-smart-review"
            aria-current={reviewSelected ? "page" : undefined}
            onClick={() => chooseSmartView("review")}
          >
            <span>
              <strong>Needs verification</strong>
              <em>Source correspondence is incomplete</em>
            </span>
            <b>{totalReviewCount}</b>
          </button>
          <button
            type="button"
            className={`rd-v2-library-navigator-view${readySelected ? " is-active" : ""}`}
            data-testid="library-smart-ready"
            aria-current={readySelected ? "page" : undefined}
            onClick={() => chooseSmartView("ready")}
          >
            <span>
              <strong>Query ready</strong>
              <em>Evidence ready for direct use</em>
            </span>
            <b>{totalReadyCount}</b>
          </button>
          <button
            type="button"
            className={`rd-v2-library-navigator-view${attentionSelected ? " is-active" : ""}`}
            data-testid="library-smart-attention"
            aria-current={attentionSelected ? "page" : undefined}
            onClick={() => chooseSmartView("attention")}
          >
            <span>
              <strong>Needs attention</strong>
              <em>Readiness or verification needs work</em>
            </span>
            <b>{totalAttentionCount}</b>
          </button>
        </div>

        <div className="rd-v2-library-navigator-section">
          <span className="rd-v2-library-navigator-section-label">Collections</span>
          {collections.length ? (
            <div className="rd-v2-library-navigator-tree">
              {collections.map((collection) => (
                <LibraryDirectoryNode
                  key={collection.id}
                  node={collection}
                  depth={0}
                  folderId={folderId}
                  activePathIds={activePathIds}
                  expandedIds={expandedIds}
                  onToggleExpanded={toggleExpanded}
                  onOpenCollection={onOpenCollection}
                />
              ))}
            </div>
          ) : collectionsLoading ? (
            <div className="rd-v2-library-directory-loading" role="status" data-testid="library-collections-loading">
              <strong>Organizing the Library directory…</strong>
              <span>Your evidence is already held; the research taxonomy is still loading.</span>
            </div>
          ) : (
            <div className="rd-v2-library-navigator-empty">
              No collection taxonomy is registered yet.
            </div>
          )}
        </div>
      </nav>
    </section>
  );
}

function LibraryEvidencePane({
  visibleAssets,
  selectedId,
  scopeTitle,
  scopeNote,
  scopeAssetCount,
  scopeReadyCount,
  scopeReviewCount,
  filterMode,
  referenceCount,
  onReviewAvailable,
  onSelectDataset,
  query,
  searchMatchCount,
  onAskCurrentSearch,
  onSearchWider,
  onResetFilters,
}) {
  const showKind = true;
  const ledgerClass = "rd-v2-cap-ledger with-verify show-kind";
  const filteredSearchMiss = Boolean(query && searchMatchCount > 0 && !visibleAssets.length);
  const trueSearchMiss = Boolean(query && searchMatchCount === 0);
  const activeViewLabel =
    filterMode === "review"
      ? "Needs verification"
      : filterMode === "ready"
        ? "Query ready"
        : filterMode === "attention"
          ? "Needs attention"
          : filterMode === "not_ready"
            ? "Not query-ready"
            : "";

  return (
    <section className="rd-v2-library-all-evidence rd-v2-library-scope-pane" aria-label={`${scopeTitle} evidence`}>
      <header className="rd-v2-library-all-evidence-head rd-v2-library-scope-head">
        <div className="rd-v2-library-scope-title">
          <span>Current scope</span>
          <h2>{scopeTitle}</h2>
          <p>{scopeNote}</p>
        </div>
        <div className="rd-v2-library-scope-stats" aria-label={`${scopeTitle} summary`}>
          {activeViewLabel ? <span className="rd-v2-library-scope-view">{activeViewLabel}</span> : null}
          <span><b>{visibleAssets.length}</b> shown</span>
          <span><b>{scopeAssetCount}</b> held</span>
          <span><b>{scopeReadyCount}</b> ready</span>
          <span><b>{scopeReviewCount}</b> review</span>
        </div>
      </header>

      <div className={ledgerClass} role="table" aria-label={`${scopeTitle} Library evidence`}>
        <div className="rd-v2-cap-ledger-head" role="row">
          <span role="columnheader">Evidence</span>
          {showKind ? <span role="columnheader">Type</span> : null}
          <span role="columnheader">Source</span>
          <span role="columnheader">Verification</span>
          <span role="columnheader">Readiness</span>
        </div>
        <div className="rd-v2-cap-ledger-body">
          {visibleAssets.length ? (
            visibleAssets.map((item) => {
              const row = item?.row || item;
              const verification = libraryVerification(row);
              const active = selectedId && selectedId === (row.dataset_id || item.id);
              return (
                <button
                  key={row.dataset_id || item.id}
                  type="button"
                  className={`rd-v2-cap-ledger-row${active ? " is-selected" : ""}`}
                  data-testid="library-evidence-row"
                  data-kind="evidence"
                  data-selected={active ? "true" : "false"}
                  role="row"
                  aria-keyshortcuts="ArrowUp ArrowDown Home End Enter"
                  onKeyDown={moveLedgerFocus}
                  onClick={() => onSelectDataset?.(row)}
                >
                  <span className="rd-v2-cap-evidence" role="cell">
                    <strong>{displayName(row)}</strong>
                    <em>{descriptionLabel(row)}</em>
                    {query && row.search_match?.reasons?.length ? (
                      <span className="rd-v2-library-match" data-testid="library-search-match">
                        <b>Matched</b>
                        {row.search_match.reasons.slice(0, 2).map((reason) => (
                          <span key={`${reason.kind}-${reason.value}`}>
                            {reason.label} · {reason.value}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {showKind ? <span className="rd-v2-cap-kind" role="cell">{kindLabel(row)}</span> : null}
                  <span className="rd-v2-cap-source" role="cell">{sourceLabel(row)}</span>
                  <span
                    className={`rd-v2-cap-verify ${verification.kind}`}
                    data-testid="library-evidence-verification"
                    role="cell"
                  >
                    {verification.label}
                  </span>
                  <span className="rd-v2-cap-state" data-testid="library-evidence-readiness" role="cell">
                    <StatusPill dataset={row} />
                  </span>
                </button>
              );
            })
          ) : (
            <div className="rd-v2-cap-ledger-empty" data-testid="library-evidence-empty">
              <strong>
                {trueSearchMiss
                  ? `No held evidence matches “${query}”.`
                  : filteredSearchMiss
                    ? "Matching evidence is hidden by the current filters."
                    : "No evidence matches the current Library view."}
              </strong>
              <p>
                {trueSearchMiss
                  ? "Library searched the evidence you actually hold. Ask can interpret the need, or Discover can search beyond your estate."
                  : "Change the smart view or clear the filters to return to more held evidence."}
              </p>
              <div className="rd-v2-library-empty-actions">
                {trueSearchMiss && onAskCurrentSearch ? (
                  <button type="button" className="rd-v2-btn sm" onClick={onAskCurrentSearch}>
                    Ask Library
                  </button>
                ) : null}
                {trueSearchMiss && onSearchWider ? (
                  <button type="button" className="rd-v2-btn sm" onClick={() => onSearchWider(query)}>
                    Search wider in Discover
                  </button>
                ) : null}
                {!trueSearchMiss && onResetFilters ? (
                  <button type="button" className="rd-v2-btn sm" onClick={onResetFilters}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {referenceCount > 0 ? (
        <aside
          className="rd-v2-library-available compact rd-v2-library-scope-boundary"
          aria-label="Available evidence outside your Library"
          data-testid="library-available-evidence"
        >
          <p>
            <strong>
              {referenceCount} known record{referenceCount === 1 ? "" : "s"} {referenceCount === 1 ? "sits" : "sit"} outside your Library.
            </strong>{" "}
            They remain Discover evidence until explicitly added.
          </p>
          {onReviewAvailable ? (
            <button type="button" className="rd-v2-btn sm" onClick={onReviewAvailable}>
              Review in Discover
            </button>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}

/**
 * Persistent Library browser.
 *
 * The navigator owns location; the evidence pane owns held records. Root, folder,
 * search, and smart-view states all use the same browser rather than swapping
 * between unrelated root and folder renderers.
 */
export function LibraryEvidenceEstate({
  assets = [],
  collections = [],
  collectionsLoading = false,
  folderId = "",
  trail = [],
  filterMode = "all",
  scopeTitle = "All evidence",
  scopeNote = "",
  scopeAssetCount = 0,
  scopeReadyCount = 0,
  scopeReviewCount = 0,
  totalAssetCount = 0,
  totalReadyCount = 0,
  totalReviewCount = 0,
  totalAttentionCount = 0,
  referenceCount = 0,
  selectedId = "",
  onOpenCollection,
  onOpenRoot,
  onChooseSmartView,
  onReviewAvailable,
  onSelectDataset,
  searchQuery = "",
  searchMatchCount = 0,
  onAskCurrentSearch,
  onSearchWider,
  onResetFilters,
}) {
  const visibleAssets = assets;
  const query = String(searchQuery || "").trim();

  return (
    <section
      className="rd-v2-cap-estate rd-v2-library-browser"
      data-testid="library-evidence-estate"
      aria-label="Research evidence estate"
    >
      <LibraryNavigator
        collections={collections}
        collectionsLoading={collectionsLoading}
        folderId={folderId}
        trail={trail}
        filterMode={filterMode}
        totalAssetCount={totalAssetCount}
        totalReadyCount={totalReadyCount}
        totalReviewCount={totalReviewCount}
        totalAttentionCount={totalAttentionCount}
        onOpenCollection={onOpenCollection}
        onOpenRoot={onOpenRoot}
        onChooseSmartView={onChooseSmartView}
      />
      <LibraryEvidencePane
        visibleAssets={visibleAssets}
        selectedId={selectedId}
        scopeTitle={scopeTitle}
        scopeNote={scopeNote}
        scopeAssetCount={scopeAssetCount}
        scopeReadyCount={scopeReadyCount}
        scopeReviewCount={scopeReviewCount}
        filterMode={filterMode}
        referenceCount={referenceCount}
        onReviewAvailable={onReviewAvailable}
        onSelectDataset={onSelectDataset}
        query={query}
        searchMatchCount={searchMatchCount}
        onAskCurrentSearch={onAskCurrentSearch}
        onSearchWider={onSearchWider}
        onResetFilters={onResetFilters}
      />
    </section>
  );
}

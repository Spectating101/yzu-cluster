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

function nestedCollections(folder = {}) {
  return Object.values(folder.children || {})
    .filter((child) => child?.kind === "folder")
    .sort((a, b) => {
      const sortDelta = Number(a.sort || 500) - Number(b.sort || 500);
      if (sortDelta) return sortDelta;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    });
}

function collectionCountLabel(folder = {}) {
  const count = collectionCount(folder);
  return count > 0 ? String(count) : "";
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

function LibraryDirectoryHome({ collections, collectionsLoading, assetCount, onOpenCollection }) {
  const branchCount = collections.reduce((sum, collection) => sum + nestedCollections(collection).length, 0);

  return (
    <section className="rd-v2-library-directory-home" aria-label="Library directory" data-testid="library-directory-home">
      <header className="rd-v2-library-directory-intro">
        <div>
          <span className="rd-v2-library-directory-kicker">Collections</span>
          <h2>Choose a research area first</h2>
          <p>
            Open a collection to narrow the estate before inspecting evidence. If you already know what you need, search above.
          </p>
        </div>
        <div className="rd-v2-library-directory-summary" aria-label="Library directory summary">
          <span><b>{collections.length}</b> research area{collections.length === 1 ? "" : "s"}</span>
          <span><b>{branchCount}</b> collection{branchCount === 1 ? "" : "s"}</span>
          <span><b>{assetCount}</b> evidence asset{assetCount === 1 ? "" : "s"}</span>
        </div>
      </header>

      {collections.length ? (
        <div className="rd-v2-library-directory-tree">
          {collections.map((collection) => {
            const branches = nestedCollections(collection);
            const count = collectionCount(collection);
            return (
              <article className="rd-v2-library-directory-shelf" key={collection.id}>
                <button
                  type="button"
                  className="rd-v2-library-directory-shelf-head"
                  data-testid="library-collection-filter"
                  onClick={() => onOpenCollection?.(collection)}
                >
                  <span className="rd-v2-library-directory-folder" aria-hidden="true">▾</span>
                  <span className="rd-v2-library-directory-shelf-copy">
                    <strong>{collection.name || collection.label || collection.id}</strong>
                    {collection.blurb ? <em>{collection.blurb}</em> : null}
                  </span>
                  <span className="rd-v2-library-directory-shelf-count">
                    {branches.length ? `${branches.length} collection${branches.length === 1 ? "" : "s"}` : "Collection"}
                    {count ? ` · ${count} asset${count === 1 ? "" : "s"}` : ""}
                  </span>
                  <span aria-hidden="true">→</span>
                </button>

                {branches.length ? (
                  <div className="rd-v2-library-directory-branches" aria-label={`${collection.name || collection.id} collections`}>
                    {branches.map((branch) => {
                      const branchAssets = collectionCount(branch);
                      return (
                        <button
                          key={branch.id}
                          type="button"
                          className="rd-v2-library-directory-branch"
                          data-testid="library-directory-branch"
                          onClick={() => onOpenCollection?.(branch)}
                        >
                          <span className="rd-v2-library-directory-branch-line" aria-hidden="true">└</span>
                          <span>
                            <strong>{branch.name || branch.id}</strong>
                            {branch.blurb ? <em>{branch.blurb}</em> : null}
                          </span>
                          <b>{branchAssets}</b>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : collectionsLoading ? (
        <div className="rd-v2-library-directory-loading" role="status" data-testid="library-collections-loading">
          <strong>Organizing the Library directory…</strong>
          <span>Your evidence is already held; the research taxonomy is still loading.</span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Root Library composition.
 *
 * The home state orients before it lists: users see the research directory and
 * its nested collections first, then the complete evidence ledger below. Search
 * deliberately collapses that hierarchy and returns direct evidence matches.
 */
export function LibraryEvidenceEstate({
  assets = [],
  collections = [],
  collectionsLoading = false,
  referenceCount = 0,
  onOpenCollection,
  onReviewAvailable,
  onSelectDataset,
  searchQuery = "",
  searchMatchCount = 0,
  onAskCurrentSearch,
  onSearchWider,
  onResetFilters,
}) {
  const visibleAssets = assets;
  const showKind = true;
  const ledgerClass = "rd-v2-cap-ledger with-verify show-kind";
  const query = String(searchQuery || "").trim();
  const directoryFirst = !query && Boolean(collections.length || collectionsLoading);
  const filteredSearchMiss = Boolean(query && searchMatchCount > 0 && !visibleAssets.length);
  const trueSearchMiss = Boolean(query && searchMatchCount === 0);

  return (
    <section className="rd-v2-cap-estate" data-testid="library-evidence-estate" aria-label="Research evidence estate">
      {directoryFirst ? (
        <LibraryDirectoryHome
          collections={collections}
          collectionsLoading={collectionsLoading}
          assetCount={visibleAssets.length}
          onOpenCollection={onOpenCollection}
        />
      ) : null}

      <section className={`rd-v2-library-all-evidence${directoryFirst ? " after-directory" : ""}`} aria-label="All Library evidence">
        {directoryFirst ? (
          <header className="rd-v2-library-all-evidence-head">
            <div>
              <span>All evidence</span>
              <h2>Complete Library ledger</h2>
            </div>
            <p>{visibleAssets.length} held asset{visibleAssets.length === 1 ? "" : "s"} across the directory above.</p>
          </header>
        ) : null}

        <div className={ledgerClass} role="table" aria-label="Library evidence">
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
                return (
                  <button
                    key={row.dataset_id || item.id}
                    type="button"
                    className="rd-v2-cap-ledger-row"
                    data-testid="library-evidence-row"
                    data-kind="evidence"
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
                      : "No evidence matches the current Library filters."}
                </strong>
                <p>
                  {trueSearchMiss
                    ? "Library searched the evidence you actually hold. Ask can interpret the need, or Discover can search beyond your estate."
                    : "Reset the filters to return to the full held-evidence view."}
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
      </section>

      {referenceCount > 0 ? (
        <aside className="rd-v2-library-available compact" aria-label="Available evidence outside your Library" data-testid="library-available-evidence">
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

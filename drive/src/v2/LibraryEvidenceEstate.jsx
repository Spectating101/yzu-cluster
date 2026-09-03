import { useEffect, useMemo, useState } from "react";
import { LIBRARY_FOLDERS_ROOT } from "@/driveTree";
import { displayName, libraryAssetPresentation } from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { StatusPill } from "@/v2/StatusPill";
import "@/v2/capability-convergence.css";
import "@/v2/library-evidence-rigor.css";
import "@/v2/library-auto-catalog.css";
import "@/v2/library-live-scale.css";

const PAGE_SIZE = 50;

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

function collectionCountLabel(folder = {}) {
  const count = Number(folder.dataset_count || folder.asset_count || folder.count || 0);
  return Number.isFinite(count) && count > 0 ? String(count) : "";
}

function collectionName(folder = {}) {
  return folder.name || folder.label || folder.id || "Collection";
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
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  // A new search is a new semantic scope, so begin it from the first page.
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [query]);

  // Live catalogue hydration replaces the backing array. Preserve the user's
  // browsing depth through that refresh and clamp only if the result set shrinks.
  useEffect(() => {
    setVisibleLimit((limit) => {
      if (visibleAssets.length <= PAGE_SIZE) return PAGE_SIZE;
      return Math.min(Math.max(limit, PAGE_SIZE), visibleAssets.length);
    });
  }, [visibleAssets.length]);

  const pagedAssets = useMemo(
    () => visibleAssets.slice(0, visibleLimit),
    [visibleAssets, visibleLimit],
  );
  const hasMore = pagedAssets.length < visibleAssets.length;
  const filteredSearchMiss = Boolean(query && searchMatchCount > 0 && !visibleAssets.length);
  const trueSearchMiss = Boolean(query && searchMatchCount === 0);

  return (
    <section className="rd-v2-cap-estate" data-testid="library-evidence-estate" aria-label="Research evidence estate">
      {collections.length || collectionsLoading ? (
        <div className="rd-v2-cap-collections" aria-label="Library collection shortcuts and folder storage">
          <span className="rd-v2-cap-collections-label">Collections</span>
          {collections.length ? (
            <div className="rd-v2-cap-collection-list">
              <button
                type="button"
                className="rd-v2-cap-collection rd-v2-cap-folders-root"
                data-testid="library-folders-root"
                aria-label="Browse all storage folders"
                title="Browse the Library storage structure"
                onClick={() => onOpenCollection?.({ id: LIBRARY_FOLDERS_ROOT, name: "Folders" })}
              >
                <span>Folders</span>
                <span aria-hidden="true">→</span>
              </button>
              {collections.map((collection) => {
                const name = collectionName(collection);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    className="rd-v2-cap-collection"
                    data-testid="library-collection-filter"
                    aria-label={`Open ${name} directory`}
                    title={`Open ${name} in Folders`}
                    onClick={() => onOpenCollection?.(collection)}
                  >
                    <span>{name}</span>
                    {collectionCountLabel(collection) ? <b>{collectionCountLabel(collection)}</b> : null}
                    <span aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="rd-v2-cap-collections-loading" role="status" data-testid="library-collections-loading">
              Organizing collections…
            </span>
          )}
        </div>
      ) : null}

      <div className={ledgerClass} role="table" aria-label="Library evidence">
        <div className="rd-v2-cap-ledger-head" role="row">
          <span role="columnheader">Evidence</span>
          {showKind ? <span role="columnheader">Type</span> : null}
          <span role="columnheader">Source</span>
          <span role="columnheader" title="Whether the recorded source evidence has been checked">Verify</span>
          <span role="columnheader" title="Whether this evidence can be used directly for research or querying">Readiness</span>
        </div>
        <div className="rd-v2-cap-ledger-body">
          {visibleAssets.length ? (
            pagedAssets.map((item) => {
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

      {visibleAssets.length > PAGE_SIZE ? (
        <div className="rd-v2-library-pagination" aria-label="Library evidence pagination">
          <span>Showing {pagedAssets.length} of {visibleAssets.length} assets</span>
          {hasMore ? (
            <button type="button" className="rd-v2-btn sm" onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}>
              Load {Math.min(PAGE_SIZE, visibleAssets.length - pagedAssets.length)} more
            </button>
          ) : (
            <button type="button" className="rd-v2-btn sm ghost" onClick={() => setVisibleLimit(PAGE_SIZE)}>
              Back to first {PAGE_SIZE}
            </button>
          )}
        </div>
      ) : null}

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

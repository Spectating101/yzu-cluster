import { useState } from "react";
import { displayName, libraryAssetPresentation, statusPillKind } from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { StatusPill } from "@/v2/StatusPill";
import { LibraryPackagePanel } from "@/v2/LibraryPackagePanel";
import "@/v2/capability-convergence.css";
import "@/v2/library-evidence-rigor.css";
import "@/v2/library-auto-catalog.css";

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

/**
 * Root Library composition.
 *
 * The Library behaves like a serious file browser: collections narrow context,
 * the ledger remains the primary object, and keyboard navigation never requires
 * opening a second interaction mode. Research Drive adds evidence authority to
 * that familiar grammar rather than replacing it with bespoke dashboard chrome.
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
  const [packageOpen, setPackageOpen] = useState(false);
  const visibleAssets = assets;
  const showKind = visibleAssets.some((item) => presentationKind(item?.row || item) !== "dataset");
  const ledgerClass = `rd-v2-cap-ledger with-verify${showKind ? " show-kind" : ""}`;
  const query = String(searchQuery || "").trim();
  const filteredSearchMiss = Boolean(query && searchMatchCount > 0 && !visibleAssets.length);
  const trueSearchMiss = Boolean(query && searchMatchCount === 0);
  const packageAvailable = Boolean(query && visibleAssets.length);

  return (
    <section className="rd-v2-cap-estate" data-testid="library-evidence-estate" aria-label="Research evidence estate">
      {collections.length || collectionsLoading ? (
        <div className="rd-v2-cap-collections" aria-label="Curated research collections">
          <span className="rd-v2-cap-collections-label">Collections</span>
          {collections.length ? (
            <div className="rd-v2-cap-collection-list">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className="rd-v2-cap-collection"
                  data-testid="library-collection-filter"
                  onClick={() => onOpenCollection?.(collection)}
                >
                  <span>{collection.name || collection.label || collection.id}</span>
                  {collectionCountLabel(collection) ? <b>{collectionCountLabel(collection)}</b> : null}
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="rd-v2-cap-collections-loading" role="status" data-testid="library-collections-loading">
              Organizing collections…
            </span>
          )}
        </div>
      ) : null}

      {packageAvailable ? (
        <div className="rd-v2-library-package-context" data-testid="library-package-context">
          <div>
            <span className="rd-v2-eyebrow">Held evidence for this request</span>
            <strong>{visibleAssets.length} visible match{visibleAssets.length === 1 ? "" : "es"}</strong>
            <p>Reason across these holdings with Ask, or prepare a portable package from an explicit reviewed selection.</p>
          </div>
          <div className="rd-v2-library-package-context-actions">
            {onAskCurrentSearch ? (
              <button type="button" className="rd-v2-btn sm ghost" onClick={onAskCurrentSearch}>
                Ask Library
              </button>
            ) : null}
            <button
              type="button"
              className="rd-v2-btn sm primary rd-v2-library-package-trigger"
              onClick={() => setPackageOpen(true)}
              data-testid="library-package-open"
            >
              Prepare research package <span>{visibleAssets.length}</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className={ledgerClass} role="table" aria-label="Library evidence">
        <div className="rd-v2-cap-ledger-head" role="row">
          <span role="columnheader">Evidence</span>
          {showKind ? <span role="columnheader">Type</span> : null}
          <span role="columnheader">Source</span>
          <span role="columnheader">Verify</span>
          <span role="columnheader">State</span>
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

      <LibraryPackagePanel
        open={packageOpen}
        onClose={() => setPackageOpen(false)}
        researchNeed={query}
        assets={visibleAssets}
      />
    </section>
  );
}

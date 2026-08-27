import { useMemo, useState } from "react";
import { displayName, libraryAssetPresentation, statusPillKind } from "@/v2/datasetMeta";
import { libraryVerification } from "@/v2/libraryVerification";
import { StatusPill } from "@/v2/StatusPill";
import "@/v2/capability-convergence.css";
import "@/v2/library-evidence-rigor.css";

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

function catalogViewMatches(row = {}, view) {
  const kind = presentationKind(row);
  if (view === "data") return kind === "dataset" || kind === "metadata_index";
  if (view === "literature") return kind === "scholarly_work";
  if (view === "sources") return kind === "live_source";
  if (view === "attention") {
    const readiness = statusPillKind(row).kind;
    const verification = libraryVerification(row).kind;
    return readiness !== "query-ready" || !["verified", "matched"].includes(verification);
  }
  return true;
}

function buildCatalogViews(assets = []) {
  const rows = assets.map((item) => item?.row || item);
  const candidates = [
    { key: "all", label: "All", count: rows.length },
    { key: "data", label: "Data", count: rows.filter((row) => catalogViewMatches(row, "data")).length },
    { key: "literature", label: "Literature", count: rows.filter((row) => catalogViewMatches(row, "literature")).length },
    { key: "sources", label: "Live sources", count: rows.filter((row) => catalogViewMatches(row, "sources")).length },
    { key: "attention", label: "Needs attention", count: rows.filter((row) => catalogViewMatches(row, "attention")).length },
  ];
  return candidates.filter((view) => view.key === "all" || view.count > 0);
}

/**
 * Root Library composition for capability convergence.
 *
 * The estate is deliberately not a filesystem. Evidence identity is canonical;
 * automatic catalogue views are projections over that evidence, while
 * collections remain an optional human/project curation layer. Neither view
 * changes possession, provenance, verification, or readiness.
 */
export function LibraryEvidenceEstate({
  assets = [],
  collections = [],
  collectionsLoading = false,
  referenceCount = 0,
  onOpenCollection,
  onReviewAvailable,
  onSelectDataset,
}) {
  const [catalogView, setCatalogView] = useState("all");
  const catalogViews = useMemo(() => buildCatalogViews(assets), [assets]);
  const activeView = catalogViews.some((view) => view.key === catalogView) ? catalogView : "all";
  const visibleAssets = useMemo(
    () => assets.filter((item) => catalogViewMatches(item?.row || item, activeView)),
    [activeView, assets],
  );
  const showKind = visibleAssets.some((item) => presentationKind(item?.row || item) !== "dataset");
  const ledgerClass = `rd-v2-cap-ledger with-verify${showKind ? " show-kind" : ""}`;

  return (
    <section className="rd-v2-cap-estate" data-testid="library-evidence-estate" aria-label="Research evidence estate">
      <header className="rd-v2-cap-estate-head">
        <div>
          <span className="rd-v2-eyebrow">Your Library</span>
          <h2>Research evidence estate</h2>
          <p>See what you actually have. Library derives useful views from evidence metadata; those views never move or redefine the underlying asset.</p>
        </div>
        <strong className="rd-v2-cap-estate-count">
          {assets.length} asset{assets.length === 1 ? "" : "s"}
        </strong>
      </header>

      <div className="rd-v2-library-auto-catalog" aria-label="Automatic catalogue views" data-testid="library-auto-catalog">
        <div className="rd-v2-library-auto-catalog-copy">
          <span className="rd-v2-cap-collections-label">Auto catalogue</span>
          <p>Generated from the evidence itself. Change views without filing anything into a directory.</p>
        </div>
        <div className="rd-v2-library-auto-view-list">
          {catalogViews.map((view) => (
            <button
              key={view.key}
              type="button"
              className={`rd-v2-library-auto-view${activeView === view.key ? " active" : ""}`}
              aria-pressed={activeView === view.key}
              data-testid={`library-auto-view-${view.key}`}
              onClick={() => setCatalogView(view.key)}
            >
              <span>{view.label}</span>
              <b>{view.count}</b>
            </button>
          ))}
        </div>
      </div>

      {collections.length || collectionsLoading ? (
        <div className="rd-v2-cap-collections" aria-label="Curated research collections">
          <div className="rd-v2-library-curation-copy">
            <span className="rd-v2-cap-collections-label">Curated collections</span>
            <small>Optional human or project organization; collections do not determine where evidence lives.</small>
          </div>
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
              Curated collections are still loading…
            </span>
          )}
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
                  onClick={() => onSelectDataset?.(row)}
                >
                  <span className="rd-v2-cap-evidence" role="cell">
                    <strong>{displayName(row)}</strong>
                    <em>{descriptionLabel(row)}</em>
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
            <div className="rd-v2-cap-ledger-empty">
              <strong>No evidence matches the current Library view.</strong>
              <p>Choose another catalogue view, clear the filter or search, add evidence, or use Discover for evidence that is not yet in the Library.</p>
            </div>
          )}
        </div>
      </div>

      {referenceCount > 0 ? (
        <aside className="rd-v2-library-available" aria-label="Available evidence outside your Library" data-testid="library-available-evidence">
          <div>
            <span className="rd-v2-eyebrow">Wider Research Drive</span>
            <h3>Available, not in your Library</h3>
            <p>
              Research Drive knows {referenceCount} additional catalogue record{referenceCount === 1 ? "" : "s"} that are not held in this Library. They remain outside your evidence estate until explicitly added.
            </p>
          </div>
          {onReviewAvailable ? (
            <button type="button" className="rd-v2-btn sm" onClick={onReviewAvailable}>
              Find missing evidence
            </button>
          ) : (
            <span className="rd-v2-library-available-note">Use Discover to evaluate them before acquisition.</span>
          )}
        </aside>
      ) : null}
    </section>
  );
}

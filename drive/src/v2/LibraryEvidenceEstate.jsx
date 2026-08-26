import { displayName, libraryAssetPresentation } from "@/v2/datasetMeta";
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

/**
 * Root Library composition for capability convergence.
 *
 * Current selection/workspace/readiness semantics stay authoritative. Root
 * composition makes the durable evidence estate visible immediately; research
 * collections narrow that estate without becoming a gate before evidence can
 * be inspected.
 */
export function LibraryEvidenceEstate({
  assets = [],
  collections = [],
  collectionsLoading = false,
  onOpenCollection,
  onSelectDataset,
}) {
  const showKind = assets.some((item) => presentationKind(item?.row || item) !== "dataset");
  const ledgerClass = `rd-v2-cap-ledger with-verify${showKind ? " show-kind" : ""}`;

  return (
    <section className="rd-v2-cap-estate" data-testid="library-evidence-estate" aria-label="Research evidence estate">
      <header className="rd-v2-cap-estate-head">
        <div>
          <span className="rd-v2-eyebrow">Owned evidence</span>
          <h2>Evidence estate</h2>
          <p>Inspect the evidence itself first. Collections narrow the same durable estate; source, verification, and readiness remain separate claims.</p>
        </div>
        <strong className="rd-v2-cap-estate-count">
          {assets.length} asset{assets.length === 1 ? "" : "s"}
        </strong>
      </header>

      {collections.length || collectionsLoading ? (
        <div className="rd-v2-cap-collections" aria-label="Research collections">
          <span className="rd-v2-cap-collections-label">Research collections</span>
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
              Research collections are still loading…
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
          {assets.length ? (
            assets.map((item) => {
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
              <p>Clear the filter or search, add evidence, or use Discover for evidence that is not yet in the Library.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

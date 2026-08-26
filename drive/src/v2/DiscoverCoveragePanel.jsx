import { coverageSplit, coverageSummary } from "@/v2/discoverCoverage";
import "./discover-production.css";
import "./discover-visual-freeze.css";

// Library already renders shelves as rows: title, count pill, one-line subtitle.
// The first version of this drew bars and two number columns, which made one
// taxonomy look like two — the same defect as two names for one destination.
// It now borrows Library's own row classes rather than defining a second look.
export function DiscoverCoveragePanel({ catalog = [], partitions = [], shelves = [], onSearchShelf }) {
  const summary = coverageSummary(catalog, partitions, shelves);
  if (!summary.total) return null;
  const { listed, folded } = coverageSplit(catalog, partitions, shelves);

  return (
    <section className="rd-v2-discover-coverage" data-testid="discover-coverage">
      <header>
        <span className="rd-v2-discover-coverage-eyebrow">Library coverage</span>
        <span className="rd-v2-discover-coverage-totals">
          {summary.held} held · {summary.queryReady} query-ready
        </span>
      </header>
      <ol className="rd-v2-discover-evidence-path" aria-label="Discover evidence path">
        <li>
          <strong>Library first</strong>
          <span>Held evidence is checked before new acquisition.</span>
        </li>
        <li>
          <strong>Source routes</strong>
          <span>Known APIs and catalogues are tested for fit.</span>
        </li>
        <li>
          <strong>Context stays separate</strong>
          <span>References inform the search without becoming dataset offerings.</span>
        </li>
        <li>
          <strong>Reviewed acquisition</strong>
          <span>Collection starts only from an explicit route.</span>
        </li>
      </ol>
      <ul className="rd-v2-catalog rd-v2-catalog-list">
        {listed.map((shelf) => (
          <li key={shelf.id} className="rd-v2-catalog-row">
            <button type="button" onClick={() => onSearchShelf?.(shelf)} disabled={!onSearchShelf}>
              <span className="row-title">{shelf.label}</span>
              <span className="row-sub">
                {shelf.queryReady
                  ? `${shelf.queryReady} of ${shelf.total} query-ready`
                  : "catalogue only — no query path yet"}
              </span>
            </button>
            <span className="rd-v2-pill muted">{shelf.total}</span>
          </li>
        ))}
      </ul>
      {folded.length ? (
        <p className="rd-v2-discover-coverage-folded">
          {folded.map((shelf) => `${shelf.label} ${shelf.total}`).join(" · ")}
        </p>
      ) : null}
      {summary.declaredNotHeld ? (
        <p className="rd-v2-discover-coverage-gap">
          {summary.declaredNotHeld} declared but not held — Discover offers collection routes for those.
        </p>
      ) : null}
    </section>
  );
}

import { coverageSplit, coverageSummary, shelfBar } from "@/v2/discoverCoverage";

export function DiscoverCoveragePanel({ catalog = [], partitions = [], shelves = [], onSearchShelf }) {
  const summary = coverageSummary(catalog, partitions, shelves);
  if (!summary.total) return null;
  const { listed, folded } = coverageSplit(catalog, partitions, shelves);

  return (
    <section className="rd-v2-discover-coverage" data-testid="discover-coverage">
      <header>
        <span className="rd-v2-discover-coverage-eyebrow">What this searches</span>
        <span className="rd-v2-discover-coverage-totals">
          {summary.held} held · {summary.queryReady} query-ready
        </span>
      </header>
      <ul>
        {listed.map((shelf) => (
          <li key={shelf.id}>
            <button
              type="button"
              onClick={() => onSearchShelf?.(shelf)}
              disabled={!onSearchShelf}
            >
              {shelf.label}
            </button>
            <span className="rd-v2-discover-coverage-count">{shelf.total}</span>
            <span className="rd-v2-discover-coverage-bar" aria-hidden>
              <i style={{ width: `${shelfBar(shelf, summary.shelves)}%` }} />
            </span>
            <span className="rd-v2-discover-coverage-ready">
              {shelf.queryReady
                ? `${shelf.queryReady} query-ready`
                : "catalogue only — no query path yet"}
            </span>
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

import { coverageSplit, coverageSummary } from "@/v2/discoverCoverage";
import "./discover-production.css";
import "./discover-visual-freeze.css";
import "./discover-reconvergence.css";
import "./discover-reconvergence-tight.css";

export function DiscoverCoveragePanel({ catalog = [], partitions = [], shelves = [], onSearchShelf }) {
  const summary = coverageSummary(catalog, partitions, shelves);
  if (!summary.total) return null;
  const { listed, folded } = coverageSplit(catalog, partitions, shelves);

  return (
    <section className="rd-v2-discover-coverage" data-testid="discover-coverage">
      <header>
        <div className="rd-v2-discover-coverage-heading">
          <span className="rd-v2-discover-coverage-eyebrow">Your Library</span>
          <strong>{summary.held} held</strong>
          <span>{summary.queryReady} query-ready</span>
        </div>
        {summary.declaredNotHeld ? (
          <span className="rd-v2-discover-coverage-gap">
            {summary.declaredNotHeld} declared route{summary.declaredNotHeld === 1 ? "" : "s"} not held
          </span>
        ) : null}
      </header>

      <ul className="rd-v2-discover-coverage-shelves" aria-label="Library evidence families">
        {listed.map((shelf) => (
          <li key={shelf.id}>
            <button type="button" onClick={() => onSearchShelf?.(shelf)} disabled={!onSearchShelf}>
              <span>{shelf.label}</span>
              <strong>{shelf.total}</strong>
              <em>{shelf.queryReady ? `${shelf.queryReady} ready` : "catalogue"}</em>
            </button>
          </li>
        ))}
      </ul>

      {folded.length ? (
        <p className="rd-v2-discover-coverage-folded">
          More in Library · {folded.map((shelf) => `${shelf.label} ${shelf.total}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

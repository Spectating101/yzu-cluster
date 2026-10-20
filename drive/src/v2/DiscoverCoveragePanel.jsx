import { coverageSplit, coverageSummary } from "@/v2/discoverCoverage";

export function DiscoverCoveragePanel({ catalog = [], partitions = [], shelves = [], onSearchShelf }) {
  const summary = coverageSummary(catalog, partitions, shelves);
  if (!summary.total) return null;
  const { listed, folded } = coverageSplit(catalog, partitions, shelves, 4);

  return (
    <section className="rd-v2-discover-coverage" data-testid="discover-coverage">
      <header>
        <div className="rd-v2-discover-coverage-heading">
          <span className="rd-v2-discover-coverage-eyebrow">Your Library</span>
          <strong>{summary.held} datasets</strong>
          <span>{summary.queryReady} ready to query{summary.membersOnly ? ` · ${summary.membersOnly} for Yuan Ze members` : ""}</span>
        </div>
        {summary.declaredNotHeld ? (
          <span className="rd-v2-discover-coverage-gap">
            {summary.declaredNotHeld} known source{summary.declaredNotHeld === 1 ? "" : "s"} not yet collected
          </span>
        ) : null}
      </header>

      <ul className="rd-v2-discover-coverage-shelves" aria-label="Library evidence families">
        {listed.map((shelf) => (
          <li key={shelf.id}>
            <button type="button" onClick={() => onSearchShelf?.(shelf)} disabled={!onSearchShelf}>
              <span>{shelf.label}</span>
              <strong>{shelf.held}</strong>
              <em>{[
                shelf.queryReady ? `${shelf.queryReady} ready` : null,
                shelf.membersOnly ? `${shelf.membersOnly} for Yuan Ze members` : null,
                shelf.total > shelf.held ? `${shelf.total - shelf.held} documented` : null,
              ].filter(Boolean).join(" · ") || "catalogue"}</em>
            </button>
          </li>
        ))}
      </ul>

      {folded.length ? (
        <p className="rd-v2-discover-coverage-folded">
          More in Library · {folded.filter((shelf) => shelf.held > 0).map((shelf) => `${shelf.label} ${shelf.held}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

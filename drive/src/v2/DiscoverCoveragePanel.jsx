import { coverageSplit, coverageSummary } from "@/v2/discoverCoverage";
import { isLocalHolding } from "@/v2/discoverTaxonomy";
import { isOpsNoiseDataset } from "@/v2/professorVaultTree";
import { statusPillKind } from "@/v2/datasetMeta";
import "./discover-production.css";
import "./discover-visual-freeze.css";
import "./discover-reconvergence.css";
import "./discover-reconvergence-tight.css";
import "./discover-flagship.css";
import "./discover-flagship-wide.css";
import "./discover-flagship-investigation.css";

function value(row, ...keys) {
  for (const key of keys) {
    const next = String(row?.[key] ?? "").trim();
    if (next) return next;
  }
  return "";
}

function humanize(value_) {
  return String(value_ || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function heldEvidenceRows(catalog = []) {
  return catalog
    .filter((row) => row && !isOpsNoiseDataset(row) && isLocalHolding(row))
    .slice(0, 3);
}

export function DiscoverCoveragePanel({ catalog = [], partitions = [], shelves = [], onSearchShelf }) {
  const summary = coverageSummary(catalog, partitions, shelves);
  if (!summary.total) return null;
  const { listed, folded } = coverageSplit(catalog, partitions, shelves);
  const examples = heldEvidenceRows(catalog);
  const remainingHeld = Math.max(0, summary.held - examples.length);

  return (
    <section className="rd-v2-discover-coverage" data-testid="discover-coverage">
      <header>
        <div className="rd-v2-discover-coverage-heading">
          <span className="rd-v2-discover-coverage-eyebrow">Evidence already in reach</span>
          <strong>Your Library is checked first</strong>
          <span>
            {summary.held} held · {summary.queryReady} query-ready
          </span>
        </div>
        {summary.declaredNotHeld ? (
          <span className="rd-v2-discover-coverage-gap">
            {summary.declaredNotHeld} declared route{summary.declaredNotHeld === 1 ? "" : "s"} not held
          </span>
        ) : null}
      </header>

      <p className="rd-v2-discover-coverage-intro">
        State a research need above and Discover compares it against registered evidence before widening to external sources.
      </p>

      {examples.length ? (
        <ul className="rd-v2-discover-coverage-assets" aria-label="Examples of Library evidence checked by Discover">
          {examples.map((row) => {
            const title = value(row, "name", "title", "dataset_id") || "Registered evidence";
            const source = value(row, "source", "source_system", "publisher");
            const grain = humanize(value(row, "grain", "unit_of_observation"));
            const coverage = value(row, "coverage", "date_range", "temporal_coverage");
            const status = statusPillKind(row);
            return (
              <li key={row.dataset_id || row.id || title}>
                <span className="rd-v2-discover-coverage-asset-main">
                  <strong>{title}</strong>
                  <span>{[source, grain].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="rd-v2-discover-coverage-asset-meta">
                  {coverage ? <em>{coverage}</em> : null}
                  <b data-kind={status.kind}>{status.label}</b>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {remainingHeld ? (
        <p className="rd-v2-discover-coverage-more">+ {remainingHeld} more held asset{remainingHeld === 1 ? "" : "s"} checked automatically</p>
      ) : null}

      {listed.length > 1 || folded.length ? (
        <div className="rd-v2-discover-coverage-lanes">
          <span>Library lanes</span>
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
              More · {folded.map((shelf) => `${shelf.label} ${shelf.total}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

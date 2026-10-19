import { useState } from "react";
import { groupColumns, surfaceBands, surfaceSummary } from "./columnSurface.js";
import { groupBands } from "./coverageBands.js";

function profileSets(profiles, dataset, datasets) {
  const rows = Array.isArray(profiles) ? profiles : [];
  const declared = (Array.isArray(datasets) ? datasets : []).filter(Boolean);
  const ids = [...new Set([
    ...declared,
    ...rows.map((row) => row?.dataset_id).filter(Boolean),
  ])];
  if (!ids.length) ids.push(dataset || "This dataset");
  return ids
    .map((id) => ({
      id,
      profiles: rows.filter((row) => !row?.dataset_id || row.dataset_id === id),
    }))
    .filter((entry) => entry.profiles.length);
}

function DatasetSurface({ entry, inUse, expanded, onToggle, onOpenColumn, onOverride }) {
  const grouped = groupColumns(entry.profiles, inUse);
  return (
    <article className="s04-measured-dataset" data-testid="synthesis-measured-dataset">
      <header>
        <small>Mapped Library input</small>
        <strong>{entry.id}</strong>
      </header>
      <button
        type="button"
        className="s04-band-summary"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="s04-bands" role="img" aria-label={surfaceSummary(grouped)}>
          {groupBands(surfaceBands(grouped)).segments.map((segment) => (
            <b key={segment.id} data-band={segment.id} style={{ width: `${segment.percent}%` }} />
          ))}
        </span>
        <span>{surfaceSummary(grouped)}</span>
        <em>{expanded ? "▾" : "▸"}</em>
      </button>

      {grouped.inUse.length ? (
        <dl className="s04-method">
          {grouped.inUse.map((column) => (
            <div key={`${entry.id}-${column.column}`}>
              <dt>{column.column}</dt>
              <dd>{column.reads}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {expanded && grouped.groups.length ? (
        <div className="s04-options">
          <small>Observed without assistant reasoning</small>
          <ul>
            {grouped.groups.map((group) => (
              <li key={group.flag}>
                <strong>{group.columns.length}</strong> {group.heading}
                <span>{group.columns.map((column) => column.column).join(", ")}</span>
                {group.columns[0]?.warnings[0] ? <em>{group.columns[0].warnings[0]}</em> : null}
                {group.flag === "lookahead" && onOverride ? (
                  <button type="button" className="rd-v2-btn" onClick={() => onOverride(group)}>
                    Include anyway, and say why
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expanded ? (
        <ul className="s04-blueprint-recipes" data-testid="synthesis-column-list">
          {grouped.clean.map((column) => (
            <li key={`${entry.id}-${column.column}`}>
              {onOpenColumn ? (
                <button type="button" className="s04-blueprint-recipe" onClick={() => onOpenColumn(column)}>
                  <strong>{column.column}</strong>
                  <span>{column.reads} · {column.blanks}</span>
                  <em>Open →</em>
                </button>
              ) : (
                <div className="s04-blueprint-recipe is-static">
                  <strong>{column.column}</strong>
                  <span>{column.reads} · {column.blanks}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function MethodSurfacePanel({ dataset, datasets, profiles, inUse = [], onOpenColumn, onOverride }) {
  const [expanded, setExpanded] = useState({});
  const sets = profileSets(profiles, dataset, datasets);
  if (!sets.length) return null;

  return (
    <section className="s04-card" data-testid="synthesis-method-surface">
      <header className="s04-title">
        <div>
          <small>Measured evidence</small>
          <h2>{sets.length === 1 ? sets[0].id : `${sets.length} mapped Library inputs`}</h2>
        </div>
        <em className="neutral">Held bytes · no assistant</em>
      </header>
      <div className="s04-measured-datasets">
        {sets.map((entry) => (
          <DatasetSurface
            key={entry.id}
            entry={entry}
            inUse={inUse}
            expanded={Boolean(expanded[entry.id])}
            onToggle={() => setExpanded((current) => ({ ...current, [entry.id]: !current[entry.id] }))}
            onOpenColumn={onOpenColumn}
            onOverride={onOverride}
          />
        ))}
      </div>
    </section>
  );
}

export default MethodSurfacePanel;

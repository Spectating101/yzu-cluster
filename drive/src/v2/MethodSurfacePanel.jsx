import { useState } from "react";
import { groupColumns, surfaceSummary } from "./columnSurface.js";

export function MethodSurfacePanel({ dataset, profiles, inUse = [], onOpenColumn, onOverride }) {
  const [expanded, setExpanded] = useState(false);
  const grouped = groupColumns(profiles, inUse);
  if (!grouped.total) return null;

  return (
    <section className="s04-card" data-testid="synthesis-method-surface">
      <header className="s04-title">
        <div>
          <small>Evidence</small>
          <h2>{dataset || "This dataset"}</h2>
        </div>
        <em className="neutral">{surfaceSummary(grouped)}</em>
      </header>

      <dl className="s04-method">
        {grouped.inUse.map((column) => (
          <div key={column.column}>
            <dt>{column.column}</dt>
            <dd>{column.reads}</dd>
          </div>
        ))}
      </dl>

      {grouped.groups.length ? (
        <div className="s04-resolved-list">
          <small>Resolved without asking you</small>
          <ul>
            {grouped.groups.map((group) => (
              <li key={group.flag}>
                <strong>{group.columns.length}</strong> {group.heading}
                <span>{group.columns.map((column) => column.column).join(", ")}</span>
                {group.columns[0]?.warnings[0] ? <em>{group.columns[0].warnings[0]}</em> : null}
                {group.flag === "lookahead" ? (
                  <button type="button" className="rd-v2-btn" onClick={() => onOverride?.(group)}>
                    Include anyway, and say why
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="s04-actions">
        <p>
          <small>Next</small>
          Each exclusion is recorded with its reason and can be reversed.
        </p>
        <button type="button" className="rd-v2-btn" onClick={() => setExpanded((open) => !open)}>
          {expanded ? "Hide the other columns" : `Review all ${grouped.total} columns`}
        </button>
      </footer>

      {expanded ? (
        <ul className="s04-blueprint-recipes" data-testid="synthesis-column-list">
          {grouped.clean.map((column) => (
            <li key={column.column}>
              <button type="button" className="s04-blueprint-recipe" onClick={() => onOpenColumn?.(column)}>
                <strong>{column.column}</strong>
                <span>{column.reads} · {column.blanks}</span>
                <em>Open →</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default MethodSurfacePanel;

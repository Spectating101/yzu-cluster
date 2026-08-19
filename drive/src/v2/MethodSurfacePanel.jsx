import { useState } from "react";
import { groupColumns, surfaceBands, surfaceSummary } from "./columnSurface.js";
import { groupBands } from "./coverageBands.js";

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
      </header>

      <button
        type="button"
        className="s04-band-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="s04-bands" role="img" aria-label={surfaceSummary(grouped)}>
          {groupBands(surfaceBands(grouped)).segments.map((segment) => (
            <b key={segment.id} data-band={segment.id} style={{ width: `${segment.percent}%` }} />
          ))}
        </span>
        <span>{surfaceSummary(grouped)}</span>
        <em>{expanded ? "▾" : "▸"}</em>
      </button>

      <dl className="s04-method">
        {grouped.inUse.map((column) => (
          <div key={column.column}>
            <dt>{column.column}</dt>
            <dd>{column.reads}</dd>
          </div>
        ))}
      </dl>

      {expanded && grouped.groups.length ? (
        <div className="s04-options">
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

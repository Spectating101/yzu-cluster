import { scopeCanHelp, scopeHeadline, scopeOptions } from "./scopeChoice.js";

export function ScopePanel({ block, onChoose, onAsk }) {
  const scope = scopeOptions(block);
  if (!scope.blocked) return null;
  const canHelp = scopeCanHelp(scope);

  return (
    <section className="s04-card" data-testid="synthesis-scope-block">
      <header className="s04-title">
        <div>
          <small>Cannot build</small>
          <h2>{canHelp ? "Scope required" : "The join shape is the problem"}</h2>
        </div>
        <em className="warn">{scope.overPct}% over</em>
      </header>

      <dl className="s04-method">
        <div><dt>Input</dt><dd>{scope.rows.toLocaleString()} rows</dd></div>
        <div><dt>Engine limit</dt><dd>{scope.limit.toLocaleString()} rows per step</dd></div>
      </dl>
      <p className="s04-fixture">{scopeHeadline(scope)}</p>

      {canHelp ? (
        <div className="s04-resolved-list">
          <small>Scope the input · smallest cut that clears, first</small>
          <ul>
            {scope.options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={option.recommended ? "rd-v2-btn primary" : "rd-v2-btn"}
                  disabled={!option.clears}
                  onClick={() => onChoose?.(option)}
                >
                  {option.label || option.id}
                </button>
                <span>
                  {option.clears
                    ? `${option.rows.toLocaleString()} rows · −${option.discarded}%`
                    : "× refused — the engine will not run"}
                </span>
                {option.recommended ? <em>least evidence discarded</em> : null}
                {option.note ? <em>{option.note}</em> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="s04-fixture">
          Every cut still multiplies by the same factor. A smaller slice will not
          run either, so none is offered.
        </p>
      )}

      <footer className="s04-actions">
        <p>
          <small>Truth boundary</small>
          Scope changes findings, so it is your choice and not a silent trim.
        </p>
        <button type="button" className="rd-v2-btn" onClick={() => onAsk?.("Explain what this scope removes from my question.")}>
          Ask what this costs
        </button>
      </footer>
    </section>
  );
}

export default ScopePanel;

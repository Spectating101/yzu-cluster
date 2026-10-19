import { contestableCount, settledDecisions } from "./threadRecord.js";

export function SettledDecisionsPanel({ decisions, onContest }) {
  const settled = settledDecisions(decisions);
  if (!settled.length) return null;

  return (
    <section className="s04-card s04-settled" data-testid="synthesis-settled-decisions">
      <header className="s04-title">
        <div>
          <small>Settled</small>
          <h2>{settled.length} decisions · {contestableCount(settled)} you can reopen</h2>
        </div>
      </header>

      <ul className="s04-decision-list">
        {settled.map((decision) => (
          <li key={decision.id} data-authority={decision.authority}>
            <b>{decision.authorityLabel}</b>
            <span>
              <strong>{decision.summary}</strong>
              {decision.evidence ? <small>{decision.evidence}</small> : null}
            </span>
            {decision.contestable ? (
              <button type="button" className="rd-v2-btn" onClick={() => onContest?.(decision)}>
                contest this
              </button>
            ) : (
              <em>{decision.note}</em>
            )}
          </li>
        ))}
      </ul>

      <footer className="s04-actions">
        <p>
          <small>Approval boundary</small>
          Silence accepts what the desk chose, so every desk choice stays listed and
          reversible. What the data established is not a choice and cannot be reopened.
        </p>
      </footer>
    </section>
  );
}

export default SettledDecisionsPanel;

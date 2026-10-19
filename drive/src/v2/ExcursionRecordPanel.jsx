import { excursionEntries, excursionSummary } from "./threadRecord.js";

export function ExcursionRecordPanel({ excursions, onResume, onAsk }) {
  const entries = excursionEntries(excursions);
  if (!entries.length) return null;

  return (
    <section className="s04-card" data-testid="synthesis-excursion-record">
      <header className="s04-title">
        <div>
          <small>Went looking</small>
          <h2>{excursionSummary(entries)}</h2>
        </div>
      </header>

      <ul className="s04-decision-list">
        {entries.map((entry) => (
          <li key={entry.id} data-resolved={entry.resolved ? "yes" : "no"}>
            <b>{entry.at || entry.surface}</b>
            <span>
              <strong>{entry.searched}</strong>
              <small>
                {entry.found
                  ? `${entry.found} candidate${entry.found === 1 ? "" : "s"} · ${entry.verdict}`
                  : entry.verdict}
              </small>
            </span>
            {entry.resolved ? (
              <em>resolved</em>
            ) : (
              <button type="button" className="rd-v2-btn" onClick={() => onResume?.(entry)}>
                pick this up
              </button>
            )}
          </li>
        ))}
      </ul>

      <footer className="s04-actions">
        <p>
          <small>Why this is here</small>
          A search that found nothing is a result. Returning to an unchanged screen
          would lose it.
        </p>
        <button type="button" className="rd-v2-btn" onClick={() => onAsk?.("What did these searches rule out?")}>
          Ask what was ruled out
        </button>
      </footer>
    </section>
  );
}

export default ExcursionRecordPanel;

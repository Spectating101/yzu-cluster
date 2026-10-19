import { reuseDiff, shortHash } from "./threadRecord.js";

export function ReusePanel({ source, changes, onPreview, onChange }) {
  if (!source) return null;
  const diff = reuseDiff(source, changes);

  return (
    <section className="s04-card" data-testid="synthesis-reuse">
      <header className="s04-title">
        <div>
          <small>Reusing a registered method</small>
          <h2>{source.output_dataset_id || "A registered method"}</h2>
        </div>
        <em className="neutral">{shortHash(diff.from)}</em>
      </header>

      <p className="s04-fixture">
        {diff.carriedCount} settled decisions carry forward. The prior version stays
        registered and citable — this is a revision, not an overwrite.
      </p>

      <div className="s04-options">
        <small>What do you want different?</small>
        <ul>
          {diff.changes.map((change) => (
            <li key={change.id}>
              <button
                type="button"
                className={change.changed ? "rd-v2-btn primary" : "rd-v2-btn"}
                onClick={() => onChange?.(change)}
              >
                {change.label}
              </button>
              <span>
                {change.changed
                  ? `${change.before ?? "—"} → ${change.after ?? "—"}`
                  : `unchanged · ${change.before ?? "—"}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="s04-actions">
        <p>
          <small>Next</small>
          {diff.moved.length
            ? `${diff.moved.length} change${diff.moved.length === 1 ? "" : "s"} · a new method hash is computed on build.`
            : "Nothing differs yet, so a rebuild would reproduce the same output."}
        </p>
        <button
          type="button"
          className="rd-v2-btn primary"
          disabled={!diff.moved.length}
          onClick={() => onPreview?.(diff)}
        >
          Preview this revision
        </button>
      </footer>
    </section>
  );
}

export default ReusePanel;

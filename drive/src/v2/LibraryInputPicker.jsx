import { useMemo, useState } from "react";
import { matchLibraryInputs } from "./libraryInputPicker.js";

export function LibraryInputPicker({ catalog = [], mappedIds = [], busy = false, onAdd }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const matches = useMemo(() => matchLibraryInputs(catalog, query, { exclude: mappedIds }), [catalog, query, mappedIds]);

  const toggle = (id) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const close = () => {
    setOpen(false);
    setQuery("");
    setPicked(new Set());
  };

  if (!open) {
    return (
      <button type="button" className="rd-v2-btn s04-library-picker-open" onClick={() => setOpen(true)}>
        Add from Library
      </button>
    );
  }
  return (
    <section className="s04-evidence-proposal s04-library-picker" data-testid="synthesis-library-picker" aria-label="Add inputs from your Library">
      <header>
        <div>
          <small>Add from Library</small>
          <input
            type="search"
            className="rd-v2-input"
            placeholder="Search your Library by name, topic or source"
            aria-label="Search your Library"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <em>{picked.size ? `${picked.size} selected` : query.trim() ? `${matches.length} found` : ""}</em>
      </header>
      {matches.length ? (
        <ul>
          {matches.map((row) => (
            <li key={row.datasetId} className={picked.has(row.datasetId) ? "selected" : ""}>
              <label>
                <input type="checkbox" checked={picked.has(row.datasetId)} onChange={() => toggle(row.datasetId)} />
                <span>
                  <strong>{row.name}</strong>
                  <small>{[row.grain, row.ready ? "Data ready to query" : "Not query-ready yet"].filter(Boolean).join(" · ")}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : query.trim().length > 1 ? (
        <p>Nothing in your Library matches every word. Try fewer or different words.</p>
      ) : null}
      <footer>
        <button type="button" className="rd-v2-btn" onClick={close}>Close</button>
        <button
          type="button"
          className="rd-v2-btn primary"
          disabled={busy || !picked.size}
          onClick={async () => {
            await onAdd?.([...picked]);
            close();
          }}
        >
          {busy ? "Adding…" : picked.size ? `Add ${picked.size} input${picked.size === 1 ? "" : "s"}` : "Select inputs to add"}
        </button>
      </footer>
    </section>
  );
}

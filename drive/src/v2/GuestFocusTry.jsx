import { useMemo, useState } from "react";
import { displayName } from "@/v2/datasetMeta";
import { briefly } from "@/v2/GuestSynthesisShowcase";
import { matchedRows, profileFocus } from "@/v2/libraryFocus";

const SHOWN = 4;

export function GuestFocusTry({ catalog = [], placeholder = "inflation", onOpen }) {
  const [topic, setTopic] = useState("");
  const typed = topic.trim();
  const rows = useMemo(() => {
    const { terms } = profileFocus({ principal: true, profile: { research_topics: [typed] } });
    return matchedRows(catalog, terms).slice(0, SHOWN);
  }, [catalog, typed]);
  return (
    <section className="rd-v2-guest-showcase rd-v2-focus-try" aria-label="Try a research focus" data-testid="guest-focus-try">
      <span className="rd-v2-eyebrow">See it work</span>
      <h3>Try a research focus</h3>
      <p>Type a topic to see which Library datasets a profile would put first for it.</p>
      <label className="rd-v2-focus-try-field">
        <span className="rd-v2-visually-hidden">Research topic</span>
        <input
          className="rd-v2-input"
          type="search"
          value={topic}
          placeholder={`e.g. ${placeholder}`}
          autoComplete="off"
          onChange={(event) => setTopic(event.target.value)}
        />
      </label>
      {rows.length ? (
        <ul aria-label={`Datasets matched to ${typed}`}>
          {rows.map((row) => (
            <li key={row.dataset_id}>
              <button type="button" onClick={() => onOpen?.({ dataset_id: row.dataset_id })}>
                <strong>{displayName(row)}</strong>
                <span>{briefly(row.one_line || row.description, 110)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : typed ? (
        <p className="rd-v2-focus-try-empty" role="status">Nothing in the Library matches “{typed}” yet. Discover can look beyond it.</p>
      ) : null}
    </section>
  );
}

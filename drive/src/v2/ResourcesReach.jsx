import { useEffect, useState } from "react";
import { fetchJson } from "./apiCore.js";
import { resolveProviderMark } from "./providerMarks.js";
import { LockTag } from "./Lock.jsx";

const count = (value) => Number(value).toLocaleString("en-US");

export function useReach() {
  const [state, setState] = useState({ reach: null, error: "" });
  useEffect(() => {
    let current = true;
    fetchJson("/library/reach")
      .then((reach) => { if (current) setState({ reach, error: "" }); })
      .catch((error) => { if (current) setState({ reach: null, error: error.message || "unavailable" }); });
    return () => { current = false; };
  }, []);
  return state;
}

export function ReachStats({ reach, libraryCount }) {
  const c = reach?.counts || {};
  const stats = [
    libraryCount ? [count(libraryCount), "datasets in the Library"] : null,
    c.sources ? [count(c.sources), "sources we collect from"] : null,
    c.indexed_records ? [count(c.indexed_records), "research records indexed for Discover"] : null,
    c.tools ? [count(c.tools), "research tools behind Ask"] : null,
    c.archive_used_tb ? [`${Number(c.archive_used_tb).toFixed(2)} TB`, "held in the research archive"] : null,
    c.lab_machines ? [count(c.lab_machines), "lab machines for collection"] : null,
  ].filter(Boolean);
  if (!stats.length) return null;
  return (
    <div className="rd-v2-reach-stats" data-testid="resources-reach-stats" role="group" aria-label="What Research Drive holds and runs">
      {stats.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function ReachSources({ reach, licensedOpen }) {
  const families = reach?.families || [];
  if (!families.length) return null;
  return (
    <section className="rd-v2-reach-sources" data-testid="resources-reach-sources" aria-label="Sources Research Drive reaches">
      <header>
        <h2>Where the data comes from</h2>
        <p>Every source the desk can collect from or search today, and whether its data is already in the Library.</p>
      </header>
      <div className="rd-v2-reach-families">
        {families.map((family) => (
          <section key={family.id} aria-label={family.title}>
            <h3>{family.title}</h3>
            <ul>
              {family.sources.map((source) => {
                const mark = resolveProviderMark({ id: source.id, label: source.label });
                return (
                  <li key={source.id}>
                    <span className={`rd-v2-reach-mark${mark.generic ? " is-generic" : ""}`}>
                      <img src={mark.src} alt="" width={18} height={18} />
                    </span>
                    <strong>{source.label}</strong>
                    {source.status === "licensed" && !licensedOpen
                      ? <LockTag who="yuanze" />
                      : <em className={`is-${source.status}`}>{source.status_label}</em>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {reach?.layers?.length ? (
        <p className="rd-v2-reach-layers"><b>How collection runs</b> {reach.layers.join(" · ")}</p>
      ) : null}
    </section>
  );
}

const ABILITIES = [
  { label: "Preview, query and download as CSV", need: null },
  { label: "Source, coverage and provenance for every dataset", need: null },
  { label: "Check what the Library covers in Discover", need: null },
  { label: "Read finished Synthesis builds", need: null },
  { label: "Ask, the research assistant", need: "account" },
  { label: "Request a new collection", need: "account" },
  { label: "Build a dataset in Synthesis", need: "account" },
  { label: "A research profile that tunes the Library", need: "account" },
  { label: "Rows from LSEG, CRSP and Compustat", need: "yuanze" },
];

export function ReachAbilities({ signedIn, licensedOpen }) {
  const open = (need) => !need || (need === "account" ? signedIn : licensedOpen);
  return (
    <section className="rd-v2-reach-abilities" data-testid="guest-resources-access" aria-label="What you can do">
      <h2>What you can do</h2>
      <ul>
        {ABILITIES.map((item) => (
          <li key={item.label} className={open(item.need) ? "is-open" : "is-locked"}>
            <span>{item.label}</span>
            {open(item.need) ? <em>Open to you</em> : <LockTag who={item.need} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

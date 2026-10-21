import { useEffect, useState } from "react";
import { fetchJson } from "./apiCore.js";
import { resolveProviderMark } from "./providerMarks.js";
import { LockTag } from "./Lock.jsx";
import { STATUS_WORDS, initials } from "./reachText.js";

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

export function reachFacts(reach) {
  const c = reach?.counts || {};
  return [
    c.sources ? `${count(c.sources)} sources` : "",
    c.tools ? `${count(c.tools)} research tools behind Ask` : "",
    c.indexed_records ? `${count(c.indexed_records)} research records indexed` : "",
    c.archive_used_tb ? `${Number(c.archive_used_tb).toFixed(2)} TB in the research archive` : "",
    c.lab_machines ? `${count(c.lab_machines)} lab machines for collection` : "",
  ].filter(Boolean);
}

export function ReachSources({ reach, licensedOpen }) {
  const families = reach?.families || [];
  if (!families.length) return null;
  return (
    <section className="rd-v2-reach-sources" data-testid="resources-reach-sources" aria-label="Sources Research Drive reaches">
      <header>
        <h2>Where the data comes from</h2>
        {reachFacts(reach).length ? (
          <p className="rd-v2-reach-facts" data-testid="resources-reach-stats">{reachFacts(reach).join(" · ")}</p>
        ) : null}
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
                    <span className={`rd-v2-reach-mark${mark.generic ? " is-initials" : ""}`} aria-hidden="true">
                      {mark.generic ? initials(source.label) : <img src={mark.src} alt="" width={18} height={18} />}
                    </span>
                    <strong>{source.label}</strong>
                    {source.status === "licensed" && !licensedOpen
                      ? <LockTag who="yuanze" />
                      : <em className={`is-${source.status}`}>{STATUS_WORDS[source.status] || source.status_label}</em>}
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
  { label: "Preview, query and download as CSV", short: "preview, query and download", need: null },
  { label: "Source, coverage and provenance for every dataset", short: "source and provenance", need: null },
  { label: "Check what the Library covers in Discover", short: "Discover coverage checks", need: null },
  { label: "Read finished Synthesis builds", short: "finished Synthesis builds", need: null },
  { label: "Ask, the research assistant", short: "Ask", need: "account" },
  { label: "Plan a build in Synthesis", short: "planning Synthesis builds", need: "account" },
  { label: "A research profile that tunes the Library", short: "a research profile", need: "account" },
  { label: "Request a new collection", short: "new collection requests", need: "yuanze" },
  { label: "Run a Synthesis build into the Library", short: "running Synthesis builds", need: "yuanze" },
  { label: "Rows from LSEG, CRSP and Compustat", short: "LSEG, CRSP and Compustat rows", need: "yuanze" },
];

export function ReachAbilities({ signedIn, licensedOpen, compact = false, onSignIn }) {
  const open = (need) => !need || (need === "account" ? signedIn : licensedOpen);
  const locked = ABILITIES.filter((item) => !open(item.need));
  const openNow = ABILITIES.filter((item) => open(item.need));
  if (compact) {
    if (!locked.length) {
      return (
        <>
          <strong>Yuan Ze member</strong>
          <span data-testid="guest-resources-access">Everything here is open to you, including LSEG, CRSP and Compustat rows.</span>
        </>
      );
    }
    return (
      <>
        <strong>Signed in</strong>
        <span data-testid="guest-resources-access">A Yuan Ze email adds: {locked.map((item) => item.short).join(", ")}.</span>
        {onSignIn ? <button type="button" className="rd-v2-linkish" onClick={onSignIn}>Sign in with a Yuan Ze email →</button> : null}
      </>
    );
  }
  return (
    <section className="rd-v2-reach-abilities" data-testid="guest-resources-access" aria-label="What signing in adds">
      <h2>What signing in adds</h2>
      <ul>
        {locked.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <LockTag who={item.need} />
          </li>
        ))}
      </ul>
      <p className="rd-v2-reach-open-now"><b>Open to you now</b> {openNow.map((item) => item.short).join(" · ")}</p>
    </section>
  );
}

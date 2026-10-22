import { useEffect, useState } from "react";
import { listSynthesisProfiles } from "@/v2/apiCore";
import { displayName, isQueryReadyReadiness } from "@/v2/datasetMeta";
import { LockMark } from "@/v2/Lock";

export function briefly(text, limit = 130) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const first = clean.match(/^.{20,}?[.!?](?=\s|$)/);
  if (first && first[0].length <= limit) return first[0];
  const cut = clean.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}…`;
}

export function finishedBuilds(catalog = []) {
  return catalog
    .filter((row) => String(row?.dataset_id || "").startsWith("synthesis_") || row?.synthesis_analysis)
    .filter((row) => isQueryReadyReadiness(row?.analysis_readiness))
    .slice(0, 6);
}

export function GuestSynthesisShowcase({ catalog, onOpen }) {
  const builds = finishedBuilds(catalog);
  if (!builds.length) return null;
  return (
    <section className="rd-v2-guest-showcase" aria-label="Finished builds" data-testid="guest-synthesis-showcase">
      <div>
        <h3>Built in Synthesis</h3>
      </div>
      <ul>
        {builds.map((row) => (
          <li key={row.dataset_id}>
            <button type="button" onClick={() => onOpen?.({ dataset_id: row.dataset_id })}>
              <strong>{displayName(row)}</strong>
              <span>{briefly(row.one_line || row.description)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuestSynthesisMethods({ onSignIn }) {
  const [methods, setMethods] = useState([]);
  useEffect(() => {
    let current = true;
    listSynthesisProfiles()
      .then((out) => { if (current) setMethods(Array.isArray(out?.profiles) ? out.profiles : []); })
      .catch(() => { if (current) setMethods([]); });
    return () => { current = false; };
  }, []);
  if (!methods.length) return null;
  return (
    <section className="rd-v2-guest-showcase rd-v2-guest-methods" aria-label="Saved methods" data-testid="guest-synthesis-methods">
      <div>
        <h3>Recipes a build can start from</h3>
        <p>Each one is a recorded method: the inputs it joins and how it measures. Starting a build from one needs an account.</p>
      </div>
      <ul>
        {methods.map((profile) => (
          <li key={profile.id}>
            <article>
              <strong>{profile.title || profile.id}</strong>
              <span>{briefly(profile.description || "Recorded build recipe")}</span>
              {onSignIn ? (
                <button type="button" className="rd-v2-guest-method-start" onClick={() => onSignIn()} title="Sign in to start a build from this method">
                  <LockMark className="rd-v2-lock-mark" />
                  Use as starting point
                </button>
              ) : (
                <span className="rd-v2-guest-method-start">
                  <LockMark className="rd-v2-lock-mark" />
                  Use as starting point with an account
                </span>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

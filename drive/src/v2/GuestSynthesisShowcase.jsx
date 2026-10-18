import { displayName } from "@/v2/datasetMeta";

export function finishedBuilds(catalog = []) {
  return catalog
    .filter((row) => String(row?.dataset_id || "").startsWith("synthesis_") || row?.synthesis_analysis)
    .slice(0, 6);
}

export function GuestSynthesisShowcase({ catalog, onOpen }) {
  const builds = finishedBuilds(catalog);
  if (!builds.length) return null;
  return (
    <section className="rd-v2-guest-showcase" aria-label="Finished builds" data-testid="guest-synthesis-showcase">
      <div>
        <span className="rd-v2-eyebrow">See what a build produces</span>
        <h3>Finished builds you can open now</h3>
        <p>Each one is a dataset built in Synthesis from other Library data. Open it to see what it measures and where its inputs came from.</p>
      </div>
      <ul>
        {builds.map((row) => (
          <li key={row.dataset_id}>
            <button type="button" onClick={() => onOpen?.({ dataset_id: row.dataset_id })}>
              <strong>{displayName(row)}</strong>
              <span>{String(row.one_line || row.description || "").trim().slice(0, 140)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

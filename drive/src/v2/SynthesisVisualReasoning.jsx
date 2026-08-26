import { formatResult } from "./unitConflict.js";
import { joinOverlapModel, scopeRetentionModel, unitScaleModel } from "./synthesisVisualReasoning.js";
import "./synthesis-visual-reasoning.css";

function count(value) {
  return Number(value || 0).toLocaleString();
}

function percent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${Number(number.toFixed(number < 10 ? 1 : 0))}%`;
}

export function JoinOverlapVisual({ leftLabel, rightLabel, leftTotal, rightTotal, shared }) {
  const model = joinOverlapModel({ leftTotal, rightTotal, shared });
  if (!model.union) return null;
  const leftName = leftLabel || "Current population";
  const rightName = rightLabel || "Added dataset";

  return (
    <figure className="s04-viz s04-viz-overlap" data-testid="synthesis-join-overlap-visual">
      <header>
        <div>
          <small>Population overlap</small>
          <strong>{count(model.shared)} entities are usable in both datasets</strong>
        </div>
        <span>{percent(model.leftReach)} of current population</span>
      </header>

      <div className="s04-viz-overlap-body">
        <svg viewBox="0 0 560 226" role="img" aria-label={`${count(model.shared)} entities overlap between ${leftName} and ${rightName}`}>
          <g>
            <title>{leftName}</title>
            <circle className="set-left" cx="218" cy="111" r="92" />
          </g>
          <g>
            <title>{rightName}</title>
            <circle className="set-right" cx="342" cy="111" r="92" />
          </g>
          <text className="set-label left" x="174" y="38">current population</text>
          <text className="set-label right" x="386" y="38">added dataset</text>
          <text className="region-count left" x="182" y="108">{count(model.leftOnly)}</text>
          <text className="region-note left" x="182" y="126">current only</text>
          <text className="region-count shared" x="280" y="104">{count(model.shared)}</text>
          <text className="region-note shared" x="280" y="122">usable overlap</text>
          <text className="region-count right" x="378" y="108">{count(model.rightOnly)}</text>
          <text className="region-note right" x="378" y="126">added only</text>
        </svg>

        <div className="s04-viz-overlap-facts" aria-label="Join reach">
          <span><small>Current population reached</small><strong>{percent(model.leftReach)}</strong></span>
          <span><small>Added dataset reached</small><strong>{percent(model.rightReach)}</strong></span>
        </div>
      </div>

      <div className="s04-viz-population-strip" aria-label="Proportional union of both datasets">
        {model.regions.map((region) => (
          <span
            key={region.id}
            className={region.id}
            style={{ width: `${region.percent}%` }}
            title={`${region.id}: ${count(region.count)} entities (${percent(region.percent)} of union)`}
          >
            {region.percent >= 8 ? count(region.count) : null}
          </span>
        ))}
      </div>
      <figcaption>
        Circles show set membership; the strip below is proportional to the measured union. Counts, not circle area, carry magnitude.
      </figcaption>
    </figure>
  );
}

export function ScopeRetentionVisual({ scope }) {
  const model = scopeRetentionModel(scope);
  if (!model.rows || !model.limit) return null;

  return (
    <figure className="s04-viz s04-viz-scope" data-testid="synthesis-scope-retention-visual">
      <header>
        <div>
          <small>Population retained</small>
          <strong>{model.recommended ? `${count(model.kept)} of ${count(model.rows)} rows survive the smallest valid cut` : `${count(model.rows)} rows exceed the supported boundary`}</strong>
        </div>
        <span>{model.recommended ? `${percent(model.keptPercent)} kept` : `${percent(model.limitPercent)} capacity`}</span>
      </header>

      <div className="s04-viz-scope-track" role="img" aria-label={`${count(model.rows)} input rows, limit ${count(model.limit)} rows`}>
        <span className="input" />
        {model.recommended ? <span className="kept" style={{ width: `${model.keptPercent}%` }} /> : null}
        <i className="limit" style={{ left: `${Math.min(model.limitPercent, 100)}%` }}>
          <b>engine limit</b>
        </i>
        {model.options.map((option) => (
          <i
            key={option.id}
            className={`option${option.recommended ? " recommended" : ""}${option.clears ? " clears" : ""}`}
            style={{ left: `${Math.min(option.percent, 100)}%` }}
            title={`${option.label}: ${count(option.rows)} rows${option.clears ? " · clears" : " · still too large"}`}
          />
        ))}
      </div>

      <div className="s04-viz-scope-facts">
        <span><small>Input</small><strong>{count(model.rows)}</strong></span>
        <span><small>Supported maximum</small><strong>{count(model.limit)}</strong></span>
        {model.recommended ? <span><small>Discarded</small><strong>{count(model.discarded)} · {percent(model.discardedPercent)}</strong></span> : null}
      </div>
      <figcaption>Markers show where each candidate scope lands against the real execution boundary.</figcaption>
    </figure>
  );
}

function MagnitudeRows({ rows, format = formatResult }) {
  return (
    <div className="s04-viz-magnitude-rows">
      {rows.map((row) => (
        <div key={row.id} className={row.recommended ? "recommended" : ""}>
          <span className="label">{row.label}</span>
          <span className="meter"><b style={{ width: `${Math.max(row.percent, row.magnitude ? 1.5 : 0)}%` }} /></span>
          <strong>{format(row.value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function UnitScaleVisual({ conflict, outcomes }) {
  const model = unitScaleModel(conflict, outcomes);
  if (model.inputs.length < 2) return null;

  return (
    <figure className="s04-viz s04-viz-unit" data-testid="synthesis-unit-scale-visual">
      <header>
        <div>
          <small>Scale comparison</small>
          <strong>The desk sees two internally plausible series on different magnitudes</strong>
        </div>
        <span>shared scale</span>
      </header>

      <section>
        <small>Typical observed magnitude</small>
        <MagnitudeRows rows={model.inputs} />
      </section>

      {model.results.length ? (
        <section>
          <small>Downstream answer under each interpretation</small>
          <MagnitudeRows rows={model.results} />
        </section>
      ) : null}
      <figcaption>Bar length encodes absolute magnitude on a common scale; labels preserve the signed value.</figcaption>
    </figure>
  );
}

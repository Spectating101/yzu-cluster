import { useEffect, useMemo, useState } from "react";
import { rankCandidates, joinOutcomes, needsCollapse } from "./joinCandidates.js";

const METRIC_FUNCTIONS = ["count", "sum", "mean", "min", "max", "std", "median", "nunique", "quantile"];

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function slug(value) {
  const clean = text(value, "research_output")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
  return clean || "research_output";
}

function outputIdFor(thread) {
  const base = `synthesis_${slug(thread?.title || thread?.objective || "research_output")}_v1`;
  return base.slice(0, 128).replace(/_+$/g, "");
}

function evidenceIds(thread) {
  const ids = (thread?.state?.nodes || [])
    .filter((node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct")
    .map((node) => text(node?.dataset_id || node?.id))
    .filter(Boolean);
  return [...new Set(ids)];
}

function datasetProfiles(measurements, datasetId) {
  return (measurements?.column_profiles || []).filter((row) => text(row?.dataset_id) === datasetId);
}

function usefulColumns(profiles) {
  return profiles
    .filter((row) => text(row?.column))
    .sort((a, b) => {
      const af = (a.flags || []).length;
      const bf = (b.flags || []).length;
      if (af !== bf) return af - bf;
      return text(a.column).localeCompare(text(b.column));
    });
}

function newMetric(column = "") {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    function: column ? "mean" : "count",
    column,
    as: column ? `${column}_mean` : "row_count",
    q: 0.5,
  };
}

function normalizedMetric(row) {
  const fn = text(row.function, "count");
  const out = { function: fn, as: text(row.as) };
  if (fn !== "count") out.column = text(row.column);
  if (fn === "quantile") out.q = Number(row.q);
  return out;
}

function profileSummary(row) {
  const bits = [];
  if (Number.isFinite(Number(row?.rows))) bits.push(`${Number(row.rows).toLocaleString()} rows`);
  if (Number(row?.blanks || 0) > 0) bits.push(`${Number(row.blanks).toLocaleString()} blanks`);
  const flags = Array.isArray(row?.flags) ? row.flags.filter(Boolean) : [];
  if (flags.length) bits.push(flags.join(", "));
  return bits.join(" · ") || text(row?.kind, "Measured column");
}

export function SynthesisSpecificationPage({
  thread,
  measurements,
  measurementPhase = "idle",
  onRetryMeasurements,
  onPersistProposal,
  busy = false,
  onAsk,
}) {
  const mappedIds = useMemo(() => evidenceIds(thread), [thread]);
  const defaultInput = mappedIds[0] || "";
  const [inputDatasetId, setInputDatasetId] = useState(defaultInput);
  const [outputDatasetId, setOutputDatasetId] = useState(() => outputIdFor(thread));
  const [groupBy, setGroupBy] = useState([]);
  const [metrics, setMetrics] = useState(() => [newMetric("")]);
  const [joinChoice, setJoinChoice] = useState(null);
  const [joinHow, setJoinHow] = useState("inner");
  const [collapse, setCollapse] = useState("error");
  const [acceptRowLoss, setAcceptRowLoss] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!mappedIds.includes(inputDatasetId)) setInputDatasetId(mappedIds[0] || "");
  }, [inputDatasetId, mappedIds]);

  useEffect(() => {
    setOutputDatasetId(outputIdFor(thread));
    setGroupBy([]);
    setMetrics([newMetric("")]);
    setJoinChoice(null);
    setJoinHow("inner");
    setCollapse("error");
    setAcceptRowLoss(false);
    setLocalError("");
  }, [thread?.id]);

  const profiles = useMemo(
    () => usefulColumns(datasetProfiles(measurements, inputDatasetId)),
    [measurements, inputDatasetId],
  );
  const columns = profiles.map((row) => text(row.column));
  const joinCandidates = useMemo(() => rankCandidates(measurements?.join_candidates), [measurements]);
  const secondDatasetId = mappedIds.find((id) => id !== inputDatasetId) || "";

  const toggleGroup = (column) => {
    setGroupBy((current) => current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column]);
  };

  const changeMetric = (id, patch) => {
    setMetrics((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.function === "count") {
        next.column = "";
        if (!text(next.as) || /_mean$|_sum$|_median$|_std$|_min$|_max$/.test(next.as)) next.as = "row_count";
      }
      return next;
    }));
  };

  const removeMetric = (id) => {
    setMetrics((current) => current.length <= 1 ? current : current.filter((row) => row.id !== id));
  };

  const createProposal = async () => {
    setLocalError("");
    if (!inputDatasetId) {
      setLocalError("Choose one mapped Library input as the primary execution input.");
      return;
    }
    if (!/^synthesis_[a-z0-9][a-z0-9_]{2,117}$/.test(outputDatasetId)) {
      setLocalError("Output ID must start with synthesis_ and contain only lowercase letters, numbers, and underscores.");
      return;
    }
    if (!metrics.length) {
      setLocalError("Add at least one aggregate metric.");
      return;
    }

    const cleanMetrics = metrics.map(normalizedMetric);
    for (const metric of cleanMetrics) {
      if (!metric.as) {
        setLocalError("Every metric needs an output column name.");
        return;
      }
      if (metric.function !== "count" && !metric.column) {
        setLocalError(`${metric.function} requires a source column.`);
        return;
      }
      if (metric.function === "quantile" && (!Number.isFinite(metric.q) || metric.q < 0 || metric.q > 1)) {
        setLocalError("Quantile q must be between 0 and 1.");
        return;
      }
    }

    const transforms = [];
    if (joinChoice && secondDatasetId) {
      if (joinHow === "inner" && Number(joinChoice.coverage || 0) < 95 && !acceptRowLoss) {
        setLocalError("This inner join changes the observed population. Confirm that row loss is an intentional research choice.");
        return;
      }
      transforms.push({
        op: "join",
        right_dataset_id: secondDatasetId,
        on: joinChoice.leftKey === joinChoice.rightKey
          ? [joinChoice.leftKey]
          : [joinChoice.leftKey],
        how: joinHow,
        collapse: needsCollapse(joinChoice) ? { strategy: collapse } : undefined,
        accept_row_loss: Boolean(acceptRowLoss),
      });
    }

    const executionSpec = {
      input_dataset_id: inputDatasetId,
      output_dataset_id: outputDatasetId,
      group_by: groupBy,
      metrics: cleanMetrics,
      transforms,
    };
    const choices = [
      `Primary input: ${inputDatasetId}`,
      `Output: ${outputDatasetId}`,
      groupBy.length ? `Group by: ${groupBy.join(", ")}` : "No grouping keys",
      `Metrics: ${cleanMetrics.map((m) => `${m.function}${m.column ? `(${m.column})` : ""} → ${m.as}`).join("; ")}`,
    ];
    if (joinChoice && secondDatasetId) {
      choices.push(
        `Join: ${secondDatasetId} via ${joinChoice.leftKey} ↔ ${joinChoice.rightKey} (${joinHow}, ${Number(joinChoice.coverage || 0).toFixed(1)}% measured left-key coverage)`,
      );
    }

    const proposal = {
      id: `proposal_${Date.now().toString(36)}`,
      title: `Build ${outputDatasetId}`,
      summary: choices.join(". "),
      reason: "Researcher-recorded specification from measured held evidence.",
      impact: choices,
      operations: [
        {
          op: "update_spec",
          patch: {
            input_dataset_id: inputDatasetId,
            output_dataset_id: outputDatasetId,
            group_by: groupBy,
            metrics: cleanMetrics,
            transforms,
            specification_authority: "researcher",
          },
        },
        {
          op: "append_activity",
          message: `Researcher prepared execution specification for ${outputDatasetId}.`,
        },
      ],
      execution_spec: executionSpec,
    };

    try {
      await onPersistProposal?.(proposal);
    } catch (error) {
      setLocalError(text(error?.message, "The specification could not be persisted as a proposal."));
    }
  };

  const joinOutcomesForChoice = joinChoice ? joinOutcomes(joinChoice) : [];

  return (
    <section className="sj-stage-page sj-specification-page" data-testid="synthesis-stage-specification">
      <header className="sj-stage-header">
        <div>
          <small>Stage 3 · Specification</small>
          <h2>Turn measured evidence into an exact build specification.</h2>
          <p>The desk validates what is measurable. You choose what the construction should actually do.</p>
        </div>
        <span className={`sj-state-chip ${measurementPhase}`}>{measurementPhase === "ready" ? "Measured" : measurementPhase === "loading" ? "Measuring…" : measurementPhase === "error" ? "Measurement incomplete" : "Waiting for measurements"}</span>
      </header>

      {measurementPhase === "error" ? (
        <div className="sj-inline-alert warn">
          <div><strong>Measured state could not be loaded.</strong><span>The method editor will not guess the available columns.</span></div>
          <button type="button" onClick={onRetryMeasurements}>Measure again</button>
        </div>
      ) : null}

      <section className="sj-decision-block">
        <header><span>1</span><div><h3>Primary evidence input</h3><p>Choose the dataset whose rows define the starting population.</p></div></header>
        <div className="sj-choice-grid">
          {mappedIds.map((id) => (
            <button
              type="button"
              key={id}
              className={inputDatasetId === id ? "selected" : ""}
              onClick={() => setInputDatasetId(id)}
            >
              <strong>{id}</strong>
              <small>{datasetProfiles(measurements, id).length ? `${datasetProfiles(measurements, id).length} measured columns` : "Columns not measured"}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="sj-decision-block">
        <header><span>2</span><div><h3>Output identity</h3><p>The output becomes a versioned Library asset only after verified execution and registration.</p></div></header>
        <label className="sj-field wide">
          <span>Output dataset ID</span>
          <input value={outputDatasetId} onChange={(event) => setOutputDatasetId(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} spellCheck="false" />
        </label>
      </section>

      <section className="sj-decision-block">
        <header><span>3</span><div><h3>Grouping keys</h3><p>Select the columns that define one output row. Leaving this empty produces one aggregate row.</p></div></header>
        {profiles.length ? (
          <div className="sj-column-picker">
            {profiles.map((row) => (
              <label key={row.column} className={groupBy.includes(row.column) ? "selected" : ""}>
                <input type="checkbox" checked={groupBy.includes(row.column)} onChange={() => toggleGroup(row.column)} />
                <span><strong>{row.column}</strong><small>{profileSummary(row)}</small></span>
              </label>
            ))}
          </div>
        ) : <p className="sj-empty-copy">No measured columns are available yet.</p>}
      </section>

      {mappedIds.length >= 2 ? (
        <section className="sj-decision-block">
          <header><span>4</span><div><h3>Optional second-source join</h3><p>Coverage is measured before the join becomes part of the method. A low-coverage inner join is a population change, not a harmless merge.</p></div></header>
          {!joinCandidates.length ? (
            <div className="sj-inline-alert neutral"><div><strong>No measured join candidate.</strong><span>The desk will not invent a join key from names alone.</span></div></div>
          ) : (
            <>
              <div className="sj-join-candidates">
                <button type="button" className={!joinChoice ? "selected" : ""} onClick={() => setJoinChoice(null)}>
                  <strong>No join</strong><small>Keep the primary evidence population unchanged.</small>
                </button>
                {joinCandidates.map((candidate) => (
                  <button
                    type="button"
                    key={`${candidate.leftKey}:${candidate.rightKey}`}
                    className={joinChoice?.leftKey === candidate.leftKey && joinChoice?.rightKey === candidate.rightKey ? "selected" : ""}
                    disabled={!candidate.usable}
                    onClick={() => setJoinChoice(candidate)}
                  >
                    <strong>{candidate.leftKey} ↔ {candidate.rightKey}</strong>
                    <small>{candidate.usable ? `${Number(candidate.coverage || 0).toFixed(1)}% measured coverage · ${Number(candidate.matched || 0).toLocaleString()} matched` : candidate.reason || "Not usable"}</small>
                  </button>
                ))}
              </div>
              {joinChoice ? (
                <div className="sj-join-review">
                  <div className="sj-segmented" role="group" aria-label="Join type">
                    {joinOutcomesForChoice.filter((outcome) => outcome.id !== "skip").map((outcome) => (
                      <button key={outcome.id} type="button" className={joinHow === outcome.id ? "selected" : ""} onClick={() => setJoinHow(outcome.id)}>
                        <strong>{outcome.label}</strong><small>{outcome.consequence}</small>
                      </button>
                    ))}
                  </div>
                  {needsCollapse(joinChoice) ? (
                    <label className="sj-field">
                      <span>Repeated right-hand keys</span>
                      <select value={collapse} onChange={(event) => setCollapse(event.target.value)}>
                        <option value="error">Refuse ambiguous duplicates</option>
                        <option value="first">Take first match</option>
                        <option value="last">Take last match</option>
                      </select>
                    </label>
                  ) : null}
                  {joinHow === "inner" && Number(joinChoice.coverage || 0) < 95 ? (
                    <label className="sj-risk-confirm">
                      <input type="checkbox" checked={acceptRowLoss} onChange={(event) => setAcceptRowLoss(event.target.checked)} />
                      <span><strong>I intend this population change.</strong><small>The inner join keeps only the measured overlapping keys.</small></span>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section className="sj-decision-block">
        <header><span>{mappedIds.length >= 2 ? "5" : "4"}</span><div><h3>Aggregate metrics</h3><p>Each metric becomes an explicit output column in the accepted execution specification.</p></div></header>
        <div className="sj-metric-list">
          {metrics.map((metric, index) => (
            <div className="sj-metric-row" key={metric.id}>
              <label className="sj-field">
                <span>Function</span>
                <select value={metric.function} onChange={(event) => changeMetric(metric.id, { function: event.target.value })}>
                  {METRIC_FUNCTIONS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                </select>
              </label>
              {metric.function !== "count" ? (
                <label className="sj-field">
                  <span>Source column</span>
                  <select value={metric.column} onChange={(event) => changeMetric(metric.id, { column: event.target.value, as: metric.as === "row_count" ? `${event.target.value}_${metric.function}` : metric.as })}>
                    <option value="">Choose column…</option>
                    {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                </label>
              ) : <div className="sj-field-placeholder" />}
              {metric.function === "quantile" ? (
                <label className="sj-field compact"><span>q</span><input type="number" min="0" max="1" step="0.05" value={metric.q} onChange={(event) => changeMetric(metric.id, { q: event.target.value })} /></label>
              ) : null}
              <label className="sj-field">
                <span>Output column</span>
                <input value={metric.as} onChange={(event) => changeMetric(metric.id, { as: event.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} />
              </label>
              <button type="button" className="sj-remove" disabled={metrics.length <= 1} onClick={() => removeMetric(metric.id)} aria-label={`Remove metric ${index + 1}`}>×</button>
            </div>
          ))}
          <button type="button" className="sj-add-row" onClick={() => setMetrics((current) => [...current, newMetric(columns[0] || "")])}>+ Add metric</button>
        </div>
      </section>

      {measurements?.unit_conflict ? (
        <div className="sj-inline-alert warn">
          <div><strong>Measured unit conflict requires a research decision.</strong><span>{measurements.unit_conflict.left?.column} and {measurements.unit_conflict.right?.column} differ by about {measurements.unit_conflict.measured_ratio}×. Do not combine them silently.</span></div>
          {onAsk ? <button type="button" onClick={() => onAsk("Explain the measured unit conflict and the consequences of each possible treatment. Do not choose for me.")}>Discuss conflict</button> : null}
        </div>
      ) : null}

      {localError ? <div className="sj-inline-alert error" role="alert"><div><strong>Specification not ready.</strong><span>{localError}</span></div></div> : null}

      <footer className="sj-stage-actions">
        <div><strong>Next: Proposal</strong><span>The server will validate this exact specification and persist a revision hash before anything can be accepted.</span></div>
        <button type="button" className="primary" disabled={busy || measurementPhase === "loading" || !mappedIds.length} onClick={createProposal}>
          {busy ? "Validating…" : "Create reviewable proposal"}
        </button>
      </footer>
    </section>
  );
}

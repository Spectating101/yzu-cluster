import { useMemo, useState } from "react";
import { methodGraph } from "./synthesisMethodGraph.js";

function Node({ node, kind, selected, onSelect, children }) {
  return (
    <button
      type="button"
      className={`s04-diagram-node is-${kind}${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      data-testid={`method-node-${node.id}`}
      onClick={() => onSelect(node.id)}
    >
      {children}
    </button>
  );
}

function Detail({ graph, selectedId, onOpenDataset }) {
  const input = graph.inputs.find((n) => n.id === selectedId);
  const step = graph.steps.find((n) => n.id === selectedId);
  if (input) {
    return (
      <>
        <strong>{input.title}</strong>
        <dl>
          {input.grain ? <><dt>One row per</dt><dd>{input.grain}</dd></> : null}
          <dt>State</dt><dd>{input.held ? (input.queryReady ? "In your Library · ready to query" : "In your Library") : "Not held yet"}</dd>
        </dl>
        {input.held && onOpenDataset ? (
          <button type="button" className="rd-v2-linkish" onClick={() => onOpenDataset({ dataset_id: input.id })}>Open in Library →</button>
        ) : null}
      </>
    );
  }
  if (step) {
    return (
      <>
        <strong>{step.kind} {step.label}</strong>
        <ul>
          {step.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
        <small>{step.measured ? "Measured from Library data." : graph.output.registered ? "Recorded in the saved method." : "Proposed. Nothing has run."}</small>
      </>
    );
  }
  const out = graph.output;
  return (
    <>
      <strong>{out.title}</strong>
      <dl>
        {out.grain ? <><dt>One row per</dt><dd>{out.grain}</dd></> : null}
        {out.rows ? <><dt>Rows</dt><dd>{out.rows.toLocaleString()}</dd></> : null}
        {out.columns.length ? <><dt>Columns</dt><dd>{out.columns.join(", ")}</dd></> : null}
        <dt>State</dt><dd>{out.registered ? "Built · in your Library" : "Planned · not run"}</dd>
      </dl>
    </>
  );
}

export function MethodDiagram({ thread, onOpenDataset }) {
  const graph = useMemo(() => methodGraph(thread), [thread]);
  const [selectedId, setSelectedId] = useState("");
  if (!graph) return null;
  const out = graph.output;
  const active = selectedId || "output";
  const toggle = (id) => setSelectedId((current) => (current === id ? "" : id));
  return (
    <section className="s04-diagram" aria-label="How this dataset is built" data-testid="synthesis-method-diagram">
      <div className="s04-diagram-flow">
        <ul className="s04-diagram-col" aria-label="Inputs">
          {graph.inputs.map((input) => (
            <li key={input.id}>
              <Node node={input} kind="input" selected={active === input.id} onSelect={toggle}>
                <strong>{input.title}</strong>
                {input.grain ? <span>{input.grain}</span> : null}
                <em>{input.held ? "In your Library" : "Not held"}</em>
              </Node>
            </li>
          ))}
          {graph.hiddenInputs ? <li className="s04-diagram-more">+{graph.hiddenInputs} more</li> : null}
        </ul>
        {graph.steps.length ? (
          <>
            <span className="s04-diagram-arrow" aria-hidden="true">→</span>
            <ol className="s04-diagram-col" aria-label="Steps">
              {graph.steps.map((step, index) => (
                <li key={step.id}>
                  <Node node={step} kind="step" selected={active === step.id} onSelect={toggle}>
                    <strong>{index + 1}. {step.kind}</strong>
                    <span>{step.label}</span>
                    {step.facts[0] ? <em>{step.facts[0]}</em> : null}
                  </Node>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        <span className="s04-diagram-arrow" aria-hidden="true">→</span>
        <div className="s04-diagram-col">
          <Node node={out} kind="output" selected={active === "output"} onSelect={toggle}>
            <strong>{out.title}</strong>
            {out.grain ? <span>{out.grain}</span> : null}
            <em>{out.rows ? `${out.rows.toLocaleString()} rows` : out.registered ? "Built" : "Not run yet"}</em>
          </Node>
        </div>
      </div>
      <div className="s04-diagram-detail" role="region" aria-label="Selected part" aria-live="polite">
        <Detail graph={graph} selectedId={active} onOpenDataset={onOpenDataset} />
      </div>
    </section>
  );
}

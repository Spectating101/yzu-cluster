import { useEffect, useMemo, useState } from "react";
import { methodGraph, partDetail } from "./synthesisMethodGraph.js";
import { methodSelection, useMethodSelection } from "./methodSelection.js";

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

export function PartDetail({ detail, onOpenDataset }) {
  return (
    <>
      <small>{detail.kicker}</small>
      <strong>{detail.title}</strong>
      <dl>
        {detail.rows.map(([label, value], index) => (
          <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {detail.note ? <small>{detail.note}</small> : null}
      {detail.datasetId && onOpenDataset ? (
        <button type="button" className="rd-v2-linkish" onClick={() => onOpenDataset({ dataset_id: detail.datasetId })}>Open in Library →</button>
      ) : null}
    </>
  );
}

export function MethodDiagram({ thread, onOpenDataset }) {
  const graph = useMemo(() => methodGraph(thread), [thread]);
  const [selectedId, setSelectedId] = useState("");
  const { railMounted } = useMethodSelection();
  const threadId = thread?.id || "";
  useEffect(() => {
    setSelectedId("");
    methodSelection.clear();
    return () => methodSelection.clear();
  }, [threadId]);
  if (!graph) return null;
  const out = graph.output;
  const active = selectedId || "output";
  const toggle = (id) => {
    const next = selectedId === id ? "" : id;
    setSelectedId(next);
    if (next) methodSelection.select(threadId, partDetail(graph, next));
    else methodSelection.clear();
  };
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
      {!railMounted ? (
        <div className="s04-diagram-detail" role="region" aria-label="Selected part" aria-live="polite">
          <PartDetail detail={partDetail(graph, active)} onOpenDataset={onOpenDataset} />
        </div>
      ) : null}
    </section>
  );
}

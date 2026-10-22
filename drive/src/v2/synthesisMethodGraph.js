import { rankCandidates } from "./joinCandidates.js";

const INPUT_LIMIT = 4;

function str(value) {
  return String(value ?? "").trim();
}

function plainGrain(value) {
  return str(value).replace(/_/g, " ").replace(/\s*x\s*/gi, " × ");
}

function humanize(id) {
  const words = str(id).replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

function sourceNodes(state) {
  return (Array.isArray(state.nodes) ? state.nodes : []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source",
  );
}

function plannedColumnNames(state) {
  return (Array.isArray(state.plannedColumns) ? state.plannedColumns : [])
    .map((column) => str(typeof column === "string" ? column : column?.name || column?.label))
    .filter(Boolean);
}

function list(value) {
  return (Array.isArray(value) ? value : value == null || value === "" ? [] : [value]).map(str).filter(Boolean);
}

function measuredJoinFacts(candidate) {
  const facts = [];
  if (candidate.coverage != null) facts.push(`${Math.round(Number(candidate.coverage) * 10) / 10}% of keys match`);
  if (candidate.total != null && candidate.matched != null) {
    facts.push(`${Number(candidate.matched).toLocaleString()} of ${Number(candidate.total).toLocaleString()} keys`);
  }
  facts.push(Number(candidate.duplicates) > 0 ? `${Number(candidate.duplicates).toLocaleString()} duplicate keys on the right` : "no duplicate keys");
  return facts;
}

function transformStep(step, candidates, titleOf) {
  const op = str(step?.op).toLowerCase();
  if (op === "join") {
    const right = str(step.right_dataset_id);
    const on = list(step.on);
    const how = str(step.how) || "inner";
    const measured = candidates.find((c) => c.usable && c.rightDatasetId === right && (!on.length || on.every((key) => c.keyParts.includes(key) || c.leftKey === key)));
    return {
      kind: "Join",
      label: `${how} on ${on.join(", ")}`,
      facts: measured ? measuredJoinFacts(measured) : [`with ${titleOf(right)}`],
      measured: Boolean(measured),
    };
  }
  if (op === "filter") return { kind: "Filter", label: `${str(step.column)} ${str(step.cmp)} ${str(step.value)}`.trim(), facts: [], measured: false };
  if (op === "select") return { kind: "Select", label: `${list(step.columns).length} columns`, facts: [list(step.columns).join(", ")], measured: false };
  if (op === "rename") return { kind: "Rename", label: `${Object.keys(step.mapping || {}).length} columns`, facts: [], measured: false };
  if (op === "sort") return { kind: "Sort", label: `by ${list(step.by || step.columns).join(", ")}`, facts: [], measured: false };
  if (op === "head") return { kind: "Limit", label: `first ${Number(step.n || 0).toLocaleString()} rows`, facts: [], measured: false };
  return null;
}

function aggregateStep(spec) {
  const groupBy = list(spec?.group_by);
  if (!groupBy.length) return null;
  const metrics = (Array.isArray(spec?.metrics) ? spec.metrics : [])
    .map((metric) => [str(metric?.aggregate || metric?.function), str(metric?.field || metric?.column)].filter(Boolean).join(" of "))
    .filter(Boolean);
  return { kind: "Aggregate", label: `by ${groupBy.join(", ")}`, facts: metrics, measured: false };
}

function withIds(steps) {
  const seen = new Map();
  return steps.map((step) => {
    const base = step.kind.toLowerCase();
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...step, id: n === 1 && base === "aggregate" ? base : `${base}-${n}` };
  });
}

export function methodGraph(thread, names = {}) {
  const state = thread?.state || {};
  const proposedSpec = state.proposal?.execution_spec || null;
  const spec = state.execution_spec || proposedSpec;
  if (!spec) return null;
  const proposed = !state.execution_spec;
  const labels = new Map(sourceNodes(state).map((n) => [str(n.dataset_id || n.id), n]));
  const titleOf = (id) => str(names[id]) || str(labels.get(id)?.label) || humanize(id);
  const candidates = rankCandidates(state.join_candidates || []);

  const transforms = Array.isArray(spec.transforms) ? spec.transforms : [];
  const inputIds = [str(spec.input_dataset_id), ...transforms.filter((t) => str(t?.op).toLowerCase() === "join").map((t) => str(t.right_dataset_id))]
    .filter(Boolean)
    .filter((id, index, all) => all.indexOf(id) === index);
  let inputs = inputIds.map((id) => ({
    id,
    title: titleOf(id),
    grain: plainGrain(labels.get(id)?.grain),
    held: true,
    queryReady: labels.get(id)?.query_ready === true,
  }));
  const hiddenInputs = Math.max(inputs.length - INPUT_LIMIT, 0);
  inputs = inputs.slice(0, INPUT_LIMIT);

  const steps = withIds([
    ...transforms.map((step) => transformStep(step, candidates, titleOf)).filter(Boolean),
    aggregateStep(spec),
  ].filter(Boolean));

  const execution = state.execution || {};
  const rows = Number(execution.rows);
  const columns = plannedColumnNames(state);
  const outputId = str(execution.output_dataset_id || spec.output_dataset_id);
  const output = {
    id: "output",
    title: str(names[outputId]) || str(state.title || thread?.title) || "Output dataset",
    grain: plainGrain(state.required_grain || spec.grain || state.spec?.grain),
    rows: Number.isFinite(rows) && rows > 0 ? rows : null,
    columns: columns.length ? columns : [...list(spec.group_by), ...(Array.isArray(spec.metrics) ? spec.metrics : []).map((m) => str(m?.as || m?.field || m?.column)).filter(Boolean)],
    datasetId: outputId,
    status: str(execution.status),
    registered: ["registered", "query_ready"].includes(str(execution.status).toLowerCase()),
  };
  return { inputs, hiddenInputs, steps, output, proposed };
}

export function partDetail(graph, id) {
  if (!graph) return null;
  const state = graph.output.registered ? "Recorded" : graph.proposed ? "Proposed" : "Planned";
  const input = graph.inputs.find((n) => n.id === id);
  if (input) {
    return {
      id, kind: "input", kicker: "Input", title: input.title, datasetId: input.held ? input.id : "",
      rows: [
        input.grain ? ["One row per", input.grain] : null,
        ["State", input.held ? (input.queryReady ? "In your Library · ready to query" : "In your Library") : "Not held yet"],
      ].filter(Boolean),
      note: "",
    };
  }
  const index = graph.steps.findIndex((n) => n.id === id);
  if (index >= 0) {
    const step = graph.steps[index];
    return {
      id, kind: "step", kicker: `Step ${index + 1} · ${step.kind}`, title: `${step.kind} ${step.label}`, datasetId: "",
      rows: step.facts.map((fact, i) => [i === 0 ? (step.measured ? "Measured" : "Does") : "", fact]),
      note: step.measured ? "Measured from Library data." : graph.output.registered ? "Recorded in the saved method." : "Proposed. Nothing has run.",
    };
  }
  const out = graph.output;
  return {
    id: "output", kind: "output", kicker: "Output", title: out.title, datasetId: out.registered ? out.datasetId : "",
    rows: [
      out.grain ? ["One row per", out.grain] : null,
      out.rows ? ["Rows", out.rows.toLocaleString()] : null,
      out.columns.length ? ["Columns", out.columns.join(", ")] : null,
      ["State", out.registered ? "Built · in your Library" : `${state} · not run`],
    ].filter(Boolean),
    note: "",
  };
}

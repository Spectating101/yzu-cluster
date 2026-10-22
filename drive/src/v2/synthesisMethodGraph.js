import { rankCandidates } from "./joinCandidates.js";
import { recommendedConstruction } from "./synthesisBrief.js";

const INPUT_LIMIT = 4;

function str(value) {
  return String(value ?? "").trim();
}

function plainGrain(value) {
  return str(value).replace(/_/g, " ").replace(/\s*x\s*/gi, " × ");
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

function aggregateStep(spec) {
  const groupBy = (Array.isArray(spec?.group_by) ? spec.group_by : []).map(str).filter(Boolean);
  if (!groupBy.length) return null;
  const metrics = (Array.isArray(spec?.metrics) ? spec.metrics : [])
    .map((metric) => [str(metric?.aggregate), str(metric?.field)].filter(Boolean).join(" of "))
    .filter(Boolean);
  return {
    id: "aggregate",
    kind: "Aggregate",
    label: `by ${groupBy.join(", ")}`,
    facts: metrics,
    measured: false,
  };
}

function joinStep(candidate) {
  const keys = candidate.keyParts.length ? candidate.keyParts.join(", ") : candidate.leftKey;
  const facts = [];
  if (candidate.coverage != null) facts.push(`${Math.round(Number(candidate.coverage) * 10) / 10}% of keys match`);
  if (candidate.total != null && candidate.matched != null) {
    facts.push(`${Number(candidate.matched).toLocaleString()} of ${Number(candidate.total).toLocaleString()} keys`);
  }
  facts.push(Number(candidate.duplicates) > 0 ? `${Number(candidate.duplicates).toLocaleString()} duplicate keys on the right` : "no duplicate keys");
  return { id: "join", kind: "Join", label: `on ${keys}`, facts, measured: true };
}

export function methodGraph(thread) {
  const state = thread?.state || {};
  const spec = state.execution_spec || null;
  const labels = new Map(sourceNodes(state).map((n) => [str(n.dataset_id || n.id), n]));
  const construction = recommendedConstruction(thread);

  let inputs = [];
  if (spec?.input_dataset_id) {
    const id = str(spec.input_dataset_id);
    const node = labels.get(id);
    inputs = [{ id, title: str(node?.label) || id, grain: plainGrain(node?.grain), held: true, queryReady: node?.query_ready === true }];
  } else if (construction.present) {
    inputs = construction.nodes.map((n) => ({
      id: n.id, title: n.source || n.id, grain: plainGrain(n.grain), role: n.role,
      held: labels.has(n.id), queryReady: labels.get(n.id)?.query_ready === true,
    }));
  } else {
    inputs = sourceNodes(state).map((n) => ({
      id: str(n.dataset_id || n.id), title: str(n.label) || str(n.id), grain: plainGrain(n.grain),
      held: true, queryReady: n.query_ready === true,
    }));
  }
  const hiddenInputs = Math.max(inputs.length - INPUT_LIMIT, 0);
  inputs = inputs.slice(0, INPUT_LIMIT);

  const steps = [];
  const joinCandidate = rankCandidates(state.join_candidates || []).find((c) => c.usable);
  if (joinCandidate && inputs.length >= 2) steps.push(joinStep(joinCandidate));
  const aggregate = aggregateStep(spec);
  if (aggregate) steps.push(aggregate);

  const execution = state.execution || {};
  const rows = Number(execution.rows);
  const grain = plainGrain(state.required_grain || spec?.grain || state.spec?.grain);
  const columns = plannedColumnNames(state);
  const groupColumns = (spec?.group_by || []).map(str).filter(Boolean);
  const metricColumns = (spec?.metrics || []).map((m) => str(m?.field)).filter(Boolean);
  const output = {
    id: "output",
    title: str(state.title || thread?.title) || "Output dataset",
    grain,
    rows: Number.isFinite(rows) && rows > 0 ? rows : null,
    columns: columns.length ? columns : [...groupColumns, ...metricColumns],
    datasetId: str(execution.output_dataset_id || spec?.output_dataset_id),
    status: str(execution.status),
    registered: ["registered", "query_ready"].includes(str(execution.status).toLowerCase()),
  };

  if (!steps.length && !spec) return null;
  return { inputs, hiddenInputs, steps, output };
}

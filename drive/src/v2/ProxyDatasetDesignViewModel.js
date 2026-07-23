import { normalizeResearchConstruction } from "./ResearchConstructionViewModel.js";

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function first(...values) {
  return values.map((value) => text(value)).find(Boolean) || "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function humanize(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeScale(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return "Not assessed";
  const labels = {
    high: "High",
    strong: "High",
    medium: "Medium",
    moderate: "Medium",
    low: "Low",
    weak: "Low",
    partial: "Partial",
  };
  return labels[raw] || humanize(raw);
}

function targetNode(thread) {
  return asArray(thread?.state?.nodes).find(
    (node) => node?.layer === "target" || node?.type === "target" || node?.type === "output",
  ) || null;
}

function recommendationFor(state) {
  return asObject(state?.recommendation)
    || asObject(state?.recommended_construction)
    || asObject(state?.accepted_construction)
    || null;
}

function evidenceRoleIndex(recommendation) {
  return new Map(
    asArray(recommendation?.evidence_roles).map((role) => [
      text(role?.dataset_id || role?.evidence_id || role?.id),
      role,
    ]),
  );
}

function normalizeIngredient(item, role, index) {
  const semanticRole = first(
    role?.semantic_role,
    role?.role,
    item?.role,
    item?.missing ? "Measurement limitation" : "Proxy ingredient",
  );
  return {
    id: first(item?.id, item?.datasetId, role?.dataset_id, `ingredient-${index + 1}`),
    datasetId: first(item?.datasetId, role?.dataset_id),
    label: first(item?.label, role?.title, role?.dataset_id, "Unnamed source dataset"),
    role: humanize(semanticRole),
    contribution: first(
      role?.contribution,
      role?.why_it_matters,
      item?.missing
        ? "Defines what the proxy cannot measure directly."
        : `Contributes ${humanize(semanticRole).toLowerCase()} evidence to the proxy.`,
    ),
    grain: first(role?.grain, item?.grain, "Grain not established"),
    coverage: first(role?.coverage, item?.coverage, "Coverage not established"),
    stateLabel: first(item?.stateLabel, role?.availability ? humanize(role.availability) : "State not established"),
    provenance: first(item?.provenance, role?.provenance, role?.source),
    missing: Boolean(item?.missing),
    proofPending: Boolean(item?.proofPending),
  };
}

function methodSteps(raw, fallback = []) {
  const outline = asArray(raw?.method_outline).length
    ? asArray(raw.method_outline)
    : asArray(raw?.steps).length
      ? asArray(raw.steps)
      : asArray(raw?.operations).length
        ? asArray(raw.operations)
        : fallback;
  return outline.map((step) => {
    if (typeof step === "string") return step;
    return first(step?.label, step?.title, step?.description, step?.op ? humanize(step.op) : "");
  }).filter(Boolean);
}

function normalizeRecipe(raw, index, { recommended = false, executionSpec = null } = {}) {
  const recipe = asObject(raw) || {};
  const validity = asObject(recipe.validity_profile) || asObject(recipe.tradeoffs) || {};
  const fallbackSteps = executionSpec
    ? [
        ...asArray(executionSpec.transforms).map((operation) => humanize(operation?.op || operation)),
        ...(asArray(executionSpec.group_by).length ? [`Aggregate to ${asArray(executionSpec.group_by).join(" × ")}`] : []),
        ...asArray(executionSpec.metrics).map((metric) => first(metric?.as, metric?.function ? humanize(metric.function) : "")),
      ].filter(Boolean)
    : [];
  return {
    id: first(recipe.recommendation_id, recipe.id, `recipe-${index + 1}`),
    title: first(recipe.title, recipe.name, recommended ? "Recommended proxy design" : `Alternative proxy design ${index + 1}`),
    summary: first(recipe.summary, recipe.description, recipe.construct?.description, "No structured recipe summary has been recorded."),
    recommended,
    steps: methodSteps(recipe, fallbackSteps),
    assumptions: asArray(recipe.assumptions).map((value) => text(value)).filter(Boolean),
    limitation: first(recipe.main_limitation, recipe.limitation, asArray(recipe.limitations)[0], "Limitation not assessed"),
    whyRecommended: asArray(recipe.why_recommended).map((value) => text(value)).filter(Boolean),
    fidelity: normalizeScale(validity.conceptual_fidelity || validity.fidelity),
    coverage: normalizeScale(validity.coverage),
    timing: normalizeScale(validity.temporal_precision || validity.timing),
    reproducibility: normalizeScale(validity.reproducibility),
    leakageRisk: normalizeScale(validity.leakage_risk),
    supported: recipe.supported === false ? false : recipe.supported === true ? true : null,
  };
}

function outputContract(recommendation, base) {
  const raw = asObject(recommendation?.expected_output) || {};
  const grain = Array.isArray(raw.grain) ? raw.grain.join(" × ") : raw.grain;
  return {
    datasetId: first(raw.dataset_id, base.outputContract.datasetId),
    label: first(raw.title, raw.name, raw.dataset_id, base.outputContract.label),
    grain: first(grain, base.outputContract.grain),
    coverage: first(raw.coverage?.label, raw.coverage, base.period),
    destination: first(raw.destination, "Library"),
    statusLabel: base.outputContract.statusLabel,
  };
}

function backendCapability(state, recommendation, alternatives) {
  return {
    durableThread: true,
    structuredRecommendation: Boolean(recommendation),
    alternatives: alternatives.length > 0,
    acceptedConstruction: Boolean(state?.accepted_construction || state?.accepted_construction_id),
    methodSpec: Boolean(state?.method_spec || state?.method || state?.execution_spec),
    compiledPlan: Boolean(state?.compiled_plan),
    preview: Boolean(state?.preview),
    execution: Boolean(state?.execution_spec || state?.execution),
  };
}

export function normalizeProxyDatasetDesign(thread, datasets = []) {
  const base = normalizeResearchConstruction(thread, datasets);
  if (!base) return null;

  const state = thread?.state || {};
  const recommendation = recommendationFor(state);
  const roleIndex = evidenceRoleIndex(recommendation);
  const target = targetNode(thread);
  const evidence = [...base.evidenceHeld, ...base.evidenceMissing];
  const ingredients = evidence.map((item, index) => {
    const role = roleIndex.get(text(item.datasetId || item.id)) || null;
    return normalizeIngredient(item, role, index);
  });

  const idealEvidence = asArray(recommendation?.unavailable_ideal_evidence).map((item, index) => ({
    id: first(item?.id, item?.dataset_id, `ideal-${index + 1}`),
    label: first(item?.label, item?.title, item?.dataset_id, "Ideal direct measure"),
    reason: first(item?.reason, item?.limitation, item?.status, "Unavailable or incomplete"),
  }));
  if (!idealEvidence.length) {
    base.evidenceMissing.forEach((item) => idealEvidence.push({
      id: item.id,
      label: item.label,
      reason: first(item.stateLabel, "Unavailable or incomplete"),
    }));
  }

  const accepted = asObject(state.accepted_construction);
  const primaryRaw = recommendation || accepted;
  const primaryRecipe = primaryRaw
    ? normalizeRecipe(primaryRaw, 0, { recommended: true, executionSpec: state.execution_spec })
    : state.execution_spec
      ? normalizeRecipe({
          title: "Current executable proxy recipe",
          summary: first(state.method?.accepted_definition, state.execution_spec.method, "A revision-bound executable recipe is established."),
          main_limitation: "Construct-validity tradeoffs have not been recorded in structured recommendation state.",
        }, 0, { recommended: true, executionSpec: state.execution_spec })
      : null;

  const alternativeRaw = [
    ...asArray(recommendation?.alternatives),
    ...asArray(state.alternative_constructions),
  ];
  const alternatives = alternativeRaw.map((item, index) => normalizeRecipe(item, index + 1));
  const recipes = primaryRecipe ? [primaryRecipe, ...alternatives] : alternatives;
  const output = outputContract(recommendation, base);
  const capability = backendCapability(state, recommendation, alternatives);

  const construct = asObject(recommendation?.construct) || {};
  const targetLabel = first(
    construct.name,
    target?.label,
    output.label,
    base.title,
    "Target construct not established",
  );
  const targetDescription = first(
    construct.description,
    construct.construct_boundary,
    target?.interpretation,
    base.question,
  );

  let nextDecision;
  if (base.mode === "proposal") {
    nextDecision = base.nextDecision;
  } else if (!primaryRecipe) {
    nextDecision = {
      type: "generate_recipes",
      title: "Generate defensible proxy designs",
      detail: "The durable thread exists, but no structured proxy recommendation has been recorded yet.",
      primaryAction: "Generate proxy recipes",
    };
  } else if (!capability.acceptedConstruction && recommendation) {
    nextDecision = {
      type: "select_recipe",
      title: "Select or revise the recommended proxy",
      detail: "Accepting a proxy design should persist its construct, evidence roles, limitations, and intended output—without building data yet.",
      primaryAction: "Challenge recommended proxy",
    };
  } else if (base.method.state !== "accepted") {
    nextDecision = {
      type: "design_recipe",
      title: "Resolve the synthesis recipe",
      detail: "Define transformations and assumptions that materially determine the proxy before execution.",
      primaryAction: "Design synthesis recipe",
    };
  } else {
    nextDecision = {
      ...base.nextDecision,
      primaryAction: base.nextDecision.action || "Review next decision",
    };
  }

  return {
    id: base.id,
    title: base.title,
    mode: base.mode,
    target: {
      label: targetLabel,
      description: targetDescription,
      grain: first(recommendation?.expected_output?.grain, output.grain, base.unitOfAnalysis),
      population: base.population,
      period: base.period,
      measurementStatus: idealEvidence.length
        ? "Direct measurement is unavailable or incomplete"
        : "Direct-measure limitation not recorded",
    },
    ingredients,
    idealEvidence,
    primaryRecipe,
    alternatives,
    recipes,
    outputContract: output,
    nextDecision,
    capability,
    provenance: base.provenance,
    execution: state.execution || null,
    proposal: state.proposal || null,
    raw: thread,
  };
}

export function proxyComposerContext(view, selectedArea = "proxy_design") {
  if (!view) return "No active proxy dataset design is established.";
  const recipe = view.primaryRecipe;
  return [
    `construction_id: ${view.id}`,
    `selected_area: ${selectedArea}`,
    `target_construct: ${view.target.label}`,
    `target_grain: ${view.target.grain}`,
    `population: ${view.target.population}`,
    `period: ${view.target.period}`,
    `available_ingredients: ${view.ingredients.filter((item) => !item.missing).map((item) => `${item.label} [${item.role}]`).join(" | ") || "none mapped"}`,
    `measurement_limitations: ${view.idealEvidence.map((item) => `${item.label}: ${item.reason}`).join(" | ") || "none recorded"}`,
    `recommended_recipe: ${recipe ? recipe.title : "not generated"}`,
    `recipe_steps: ${recipe?.steps.join(" → ") || "not generated"}`,
    `main_limitation: ${recipe?.limitation || "not assessed"}`,
    `alternative_recipes: ${view.alternatives.map((item) => item.title).join(" | ") || "not generated"}`,
    `output_contract: ${view.outputContract.datasetId || view.outputContract.label} @ ${view.outputContract.grain}`,
    `backend_capability: recommendation=${view.capability.structuredRecommendation}; alternatives=${view.capability.alternatives}; compiled_plan=${view.capability.compiledPlan}; preview=${view.capability.preview}; execution=${view.capability.execution}`,
  ].join("\n");
}

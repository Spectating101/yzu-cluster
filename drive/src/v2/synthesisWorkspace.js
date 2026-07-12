const STATUS_META = {
  target: { label: "Target", tone: "target" },
  held: { label: "Held", tone: "held" },
  queryable: { label: "Queryable", tone: "queryable" },
  sourceable: { label: "Sourceable", tone: "sourceable" },
  needs_access: { label: "Needs access", tone: "access" },
  candidate: { label: "Candidate", tone: "candidate" },
  missing: { label: "Missing", tone: "missing" },
  process: { label: "Construction", tone: "process" },
  derived: { label: "Derived", tone: "derived" },
  proposed: { label: "Proposed", tone: "proposed" },
  unknown: { label: "Unknown", tone: "unknown" },
};

export function synthesisStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.unknown;
}

export const ATTENTION_SYNTHESIS_PROJECT = {
  id: "stablecoin_attention_proxy",
  title: "Historical stablecoin attention",
  objective:
    "Construct a defensible longitudinal attention signal for stablecoins from held and reachable evidence.",
  maturity: "exploring",
  maturityLabel: "Exploring",
  lastActivity: "Evidence map updated from lab holdings and indexed source capability.",
  materialisation: "not_materialised",
  nodes: [
    {
      id: "attention",
      type: "target",
      layer: "target",
      label: "Historical stablecoin attention",
      eyebrow: "Target construct",
      status: "target",
      role: "Research need",
      interpretation:
        "A longitudinal signal of observable public attention to individual stablecoins from 2021 onward.",
      grain: "asset-week preferred",
      coverage: "2021–2026 target",
      progress: ["Objective defined", "Evidence mapping active"],
    },
    {
      id: "search_intent",
      type: "construct",
      layer: "evidence",
      label: "Search intent",
      eyebrow: "Evidence family",
      status: "held",
      role: "Core evidence",
      interpretation: "Behavioural attention expressed through active search interest.",
    },
    {
      id: "community",
      type: "construct",
      layer: "evidence",
      label: "Community activity",
      eyebrow: "Evidence family",
      status: "held",
      role: "Core evidence",
      interpretation: "Observed discussion and engagement in public crypto communities.",
    },
    {
      id: "visibility",
      type: "construct",
      layer: "evidence",
      label: "Public visibility",
      eyebrow: "Evidence family",
      status: "held",
      role: "Core evidence",
      interpretation: "Public information-seeking and broad visibility outside trading activity.",
    },
    {
      id: "x_followers",
      type: "source",
      layer: "evidence",
      label: "Historical X follower growth",
      eyebrow: "Ideal direct measure",
      status: "missing",
      role: "Ideal measure",
      interpretation:
        "Direct platform audience growth would be useful, but verified longitudinal history is not available in the current source index.",
      source: "X / third-party archives",
      coverage: "No verified longitudinal route",
      grain: "account-date",
      progress: ["Need identified", "Known routes checked", "History unresolved"],
    },
    {
      id: "trends",
      type: "source",
      layer: "evidence",
      label: "Google Trends weekly panel",
      eyebrow: "Observed source",
      status: "held",
      role: "Core component",
      interpretation: "Search-interest signal for canonical stablecoin entities.",
      source: "Google Trends",
      coverage: "2021–2026",
      grain: "asset-week",
      progress: ["Registered", "Coverage known", "Ready for construction"],
    },
    {
      id: "reddit",
      type: "source",
      layer: "evidence",
      label: "Reddit activity panel",
      eyebrow: "Observed source",
      status: "held",
      role: "Core component",
      interpretation: "Community activity measured from public discussion volume and engagement.",
      source: "Reddit",
      coverage: "2021–2026",
      grain: "asset-week",
      progress: ["Registered", "Entity map present", "Ready for construction"],
    },
    {
      id: "wikipedia",
      type: "source",
      layer: "evidence",
      label: "Wikipedia attention panel",
      eyebrow: "Observed source",
      status: "held",
      role: "Core component",
      interpretation: "Pageview activity used as a broad public-information attention signal.",
      source: "Wikimedia",
      coverage: "2021–2026",
      grain: "asset-day",
      progress: ["Registered", "Coverage known", "Daily grain"],
    },
    {
      id: "gdelt",
      type: "source",
      layer: "evidence",
      label: "GDELT crypto news",
      eyebrow: "Agent proposal",
      status: "proposed",
      role: "Candidate validation signal",
      interpretation:
        "News coverage is related to public visibility, but is not a direct behavioural attention measure. Proposed as validation rather than a core proxy component.",
      source: "GDELT 2.1",
      coverage: "2015–present",
      grain: "event-day",
      progress: ["Indexed", "Capability known", "Role awaiting review"],
      proposalId: "gdelt-validation",
    },
    {
      id: "align",
      type: "process",
      layer: "construction",
      label: "Temporal alignment",
      eyebrow: "Construction",
      status: "process",
      role: "Harmonise evidence",
      interpretation: "Align source observations to a common asset-week research grain.",
      grain: "asset-week",
      progress: ["Target grain set", "Daily sources require aggregation"],
    },
    {
      id: "normalize",
      type: "process",
      layer: "construction",
      label: "Within-source normalisation",
      eyebrow: "Construction",
      status: "process",
      role: "Make signals comparable",
      interpretation:
        "Standardise each evidence family before combining them so scale differences do not dominate the proxy.",
      progress: ["Source-specific scaling", "Missingness rule unresolved"],
    },
    {
      id: "attention_proxy",
      type: "output",
      layer: "output",
      label: "attention_proxy_index",
      eyebrow: "Planned research asset",
      status: "derived",
      role: "Derived construct",
      interpretation:
        "Composite longitudinal attention measure built from the approved core evidence and validated against external visibility signals.",
      coverage: "Expected 2021–2026",
      grain: "asset-week",
      materialisation: "not_materialised",
      progress: ["Specification forming", "Validation pending", "Not materialised"],
    },
  ],
  edges: [
    { id: "attention-search", source: "attention", target: "search_intent", relation: "decomposes", label: "observe as" },
    { id: "attention-community", source: "attention", target: "community", relation: "decomposes", label: "observe as" },
    { id: "attention-visibility", source: "attention", target: "visibility", relation: "decomposes", label: "observe as" },
    { id: "attention-x", source: "attention", target: "x_followers", relation: "ideal", label: "ideal measure" },
    { id: "search-trends", source: "search_intent", target: "trends", relation: "measures", label: "measured by" },
    { id: "community-reddit", source: "community", target: "reddit", relation: "measures", label: "measured by" },
    { id: "visibility-wiki", source: "visibility", target: "wikipedia", relation: "measures", label: "measured by" },
    { id: "attention-gdelt", source: "attention", target: "gdelt", relation: "proposed", label: "validate with?" },
    { id: "trends-align", source: "trends", target: "align", relation: "feeds" },
    { id: "reddit-align", source: "reddit", target: "align", relation: "feeds" },
    { id: "wiki-align", source: "wikipedia", target: "align", relation: "feeds" },
    { id: "align-normalize", source: "align", target: "normalize", relation: "transforms", label: "align weekly" },
    { id: "normalize-output", source: "normalize", target: "attention_proxy", relation: "produces", label: "constructs" },
    { id: "gdelt-output", source: "gdelt", target: "attention_proxy", relation: "proposed", label: "validates?" },
  ],
  proposal: {
    id: "gdelt-validation",
    title: "Use GDELT as a validation signal",
    summary:
      "Keep news coverage outside the core proxy. Use it to test whether proxy spikes coincide with broader public visibility.",
    reason:
      "GDELT measures editorial/news coverage rather than direct user attention, so making it a required core component would change the construct.",
    nodeId: "gdelt",
    impact: ["Core proxy remains three-component", "Adds an external visibility check", "Requires entity review before validation"],
    operations: [
      { op: "update_node", id: "gdelt", patch: { status: "queryable", eyebrow: "Reachable source", role: "Validation signal", progress: ["Indexed", "Capability known", "Query design pending"], proposalId: null } },
      { op: "update_edge", id: "attention-gdelt", patch: { relation: "validates", label: "validation evidence" } },
      { op: "update_edge", id: "gdelt-output", patch: { relation: "validates", label: "validates" } },
      { op: "update_spec", patch: { validation: [["GDELT", "News coverage · external validation"]] } },
      { op: "append_activity", message: "GDELT approved as a validation signal." },
    ],
  },
  decisions: [
    { id: "missingness", label: "Minimum components per week", status: "open", detail: "2-of-3 versus complete-case construction" },
    { id: "weighting", label: "Component weighting", status: "open", detail: "Equal weighting versus reliability-adjusted weighting" },
  ],
  activity: [
    { time: "11:42", kind: "search", message: "Checked indexed routes for historical X follower history." },
    { time: "11:43", kind: "gap", message: "No verified longitudinal follower source found." },
    { time: "11:44", kind: "evidence", message: "Mapped Trends, Reddit, and Wikipedia as held evidence." },
    { time: "11:45", kind: "proposal", message: "Proposed GDELT as validation rather than a core component." },
  ],
  spec: {
    purpose: "Longitudinal public-attention signal for stablecoins.",
    grain: "asset × week",
    coreEvidence: [
      ["Google Trends", "Search intent"],
      ["Reddit", "Community activity"],
      ["Wikipedia", "Public visibility"],
    ],
    validation: [["GDELT", "News coverage · proposed"]],
    unavailable: [["Historical X follower growth", "Ideal direct measure · no verified longitudinal route"]],
    construction: [
      "Resolve canonical stablecoin identities across all source panels.",
      "Align daily and weekly observations to asset-week.",
      "Normalise each source within its own measurement scale.",
      "Apply the approved component-availability rule.",
      "Construct the composite attention index.",
      "Validate proxy behaviour against external visibility signals and known attention events.",
    ],
    limitations: [
      "Measures observable public attention rather than platform-specific audience growth.",
      "Source availability and community composition may change over time.",
    ],
  },
  plannedColumns: [
    ["asset_id", "Canonical stablecoin identity", "key"],
    ["week", "Weekly observation period", "key"],
    ["trends_component", "Normalised search-intent signal", "component"],
    ["reddit_component", "Normalised community-activity signal", "component"],
    ["wikipedia_component", "Normalised public-visibility signal", "component"],
    ["component_count", "Available core components for the week", "quality"],
    ["attention_proxy_index", "Derived longitudinal attention construct", "output"],
  ],
  chartIdeas: [
    ["Evidence coverage", "Compare longitudinal coverage and missingness across core sources."],
    ["Proxy vs validation", "Compare the constructed proxy with GDELT news visibility after materialisation."],
    ["Component contribution", "Inspect whether one source dominates the composite over time."],
  ],
};

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function humanize(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function normalizeProfileInput(raw, datasets = []) {
  const input = typeof raw === "string" ? { dataset_id: raw } : raw || {};
  const id = input.dataset_id || input.id || input.registry_id || input.name || input.title || "research_asset";
  const held = datasets.find((row) => row.dataset_id === id) || null;
  const readiness = input.analysis_readiness || input.readiness || held?.analysis_readiness || "unknown";
  return {
    id,
    label: input.name || input.title || held?.name || held?.title || humanize(id),
    source: input.source || input.source_system || held?.source || held?.source_system || "Lab registry",
    grain: input.grain || held?.grain || "Unknown grain",
    coverage: input.coverage || input.date_range || held?.coverage || held?.date_range || "Coverage not described",
    status: /instant|query|connected/i.test(String(readiness)) ? "held" : held ? "held" : "unknown",
  };
}

export function projectFromSynthesisProfile(raw, datasets = []) {
  if (!raw) return null;
  const id = raw.profile_id || raw.id || raw.key || raw.name;
  if (!id) return null;
  const title = raw.title || raw.label || raw.name || humanize(id);
  const objective = raw.objective || raw.description || raw.summary || `Construct ${title}.`;
  const inputs = asArray(raw.inputs || raw.sources || raw.datasets || raw.peer_sources || raw.peers).map((item) => normalizeProfileInput(item, datasets));
  const outputRaw = raw.output || raw.result || raw.target || {};
  const outputId = outputRaw.dataset_id || raw.output_dataset_id || raw.target_dataset_id || `${id}_output`;
  const outputLabel = outputRaw.name || outputRaw.title || raw.output_name || humanize(outputId);
  const processId = `${id}:construction`;
  const targetId = `${id}:target`;
  const outputNodeId = `${id}:output`;
  const nodes = [
    {
      id: targetId,
      type: "target",
      layer: "target",
      label: title,
      eyebrow: "Registered synthesis",
      status: "target",
      role: "Construction objective",
      interpretation: objective,
      progress: ["Profile registered", inputs.length ? `${inputs.length} source inputs described` : "Inputs not fully described"],
    },
    ...inputs.map((input, index) => ({
      id: `${id}:source:${input.id}:${index}`,
      type: "source",
      layer: "evidence",
      label: input.label,
      eyebrow: "Profile input",
      status: input.status,
      role: "Required evidence",
      interpretation: `Source input registered for ${title}.`,
      source: input.source,
      grain: input.grain,
      coverage: input.coverage,
      progress: [input.status === "held" ? "Available to the lab" : "Readiness not confirmed"],
    })),
    {
      id: processId,
      type: "process",
      layer: "construction",
      label: "Registered construction profile",
      eyebrow: "Construction",
      status: "process",
      role: "Profile-defined synthesis",
      interpretation: objective,
      progress: ["Profile logic registered", "Execution available through the synthesis service"],
    },
    {
      id: outputNodeId,
      type: "output",
      layer: "output",
      label: outputLabel,
      eyebrow: "Research output",
      status: "derived",
      role: "Derived research asset",
      interpretation: `Planned output of ${title}.`,
      grain: outputRaw.grain || raw.output_grain || "Derived research grain",
      coverage: outputRaw.coverage || raw.coverage || "Computed from input overlap",
      materialisation: "not_materialised",
      progress: ["Output specified", "Not materialised in this workspace"],
    },
  ];
  const sourceNodes = nodes.filter((node) => node.type === "source");
  const edges = [
    ...sourceNodes.map((node, index) => ({
      id: `${targetId}-source-${index}`,
      source: targetId,
      target: node.id,
      relation: "requires",
      label: "requires",
    })),
    ...sourceNodes.map((node, index) => ({
      id: `${node.id}-process-${index}`,
      source: node.id,
      target: processId,
      relation: "feeds",
    })),
    { id: `${processId}-output`, source: processId, target: outputNodeId, relation: "produces", label: "produces" },
  ];
  return {
    id: `profile:${id}`,
    profileId: id,
    title,
    objective,
    maturity: "registered",
    maturityLabel: "Registered profile",
    lastActivity: "Loaded from the synthesis registry.",
    materialisation: "not_materialised",
    nodes,
    edges,
    proposal: null,
    decisions: [],
    activity: [{ time: "Now", kind: "registry", message: "Loaded registered synthesis profile." }],
    spec: {
      purpose: objective,
      grain: outputRaw.grain || raw.output_grain || "Derived research grain",
      coreEvidence: inputs.map((input) => [input.label, input.source]),
      validation: [],
      unavailable: [],
      construction: ["Use the registered synthesis profile and inspect execution output before registration."],
      limitations: ["The registry profile does not expose a full methodological construction specification in the current frontend contract."],
    },
    plannedColumns: [],
    chartIdeas: [["Output coverage", "Materialise or preview the registered profile to inspect longitudinal output coverage."]],
  };
}

function cloneProject(project) {
  return {
    ...project,
    nodes: project.nodes.map((node) => ({ ...node, progress: asArray(node.progress) })),
    edges: project.edges.map((edge) => ({ ...edge })),
    activity: asArray(project.activity).map((row) => ({ ...row })),
    decisions: asArray(project.decisions).map((row) => ({ ...row })),
    proposal: project.proposal ? { ...project.proposal, operations: asArray(project.proposal.operations).map((op) => ({ ...op, patch: op.patch ? { ...op.patch } : undefined })) } : null,
  };
}

const ALLOWED_PATCH_OPS = new Set(["update_node", "add_node", "remove_node", "update_edge", "add_edge", "update_spec", "append_activity"]);

export function applySynthesisPatch(project, operations = []) {
  const next = cloneProject(project);
  for (const operation of operations) {
    if (!operation || !ALLOWED_PATCH_OPS.has(operation.op)) {
      throw new Error(`Unsupported synthesis patch operation: ${operation?.op || "unknown"}`);
    }
    if (operation.op === "update_node") {
      const index = next.nodes.findIndex((node) => node.id === operation.id);
      if (index < 0) throw new Error(`Unknown synthesis node: ${operation.id}`);
      next.nodes[index] = { ...next.nodes[index], ...(operation.patch || {}) };
    } else if (operation.op === "add_node") {
      if (!operation.node?.id || next.nodes.some((node) => node.id === operation.node.id)) {
        throw new Error("Synthesis node additions require a unique id.");
      }
      next.nodes.push({ ...operation.node });
    } else if (operation.op === "remove_node") {
      next.nodes = next.nodes.filter((node) => node.id !== operation.id);
      next.edges = next.edges.filter((edge) => edge.source !== operation.id && edge.target !== operation.id);
    } else if (operation.op === "update_edge") {
      const index = next.edges.findIndex((edge) => edge.id === operation.id);
      if (index < 0) throw new Error(`Unknown synthesis edge: ${operation.id}`);
      next.edges[index] = { ...next.edges[index], ...(operation.patch || {}) };
    } else if (operation.op === "add_edge") {
      if (!operation.edge?.id || next.edges.some((edge) => edge.id === operation.edge.id)) {
        throw new Error("Synthesis edge additions require a unique id.");
      }
      const ids = new Set(next.nodes.map((node) => node.id));
      if (!ids.has(operation.edge.source) || !ids.has(operation.edge.target)) {
        throw new Error("Synthesis edge endpoints must exist.");
      }
      next.edges.push({ ...operation.edge });
    } else if (operation.op === "update_spec") {
      next.spec = { ...(next.spec || {}), ...(operation.patch || {}) };
    } else if (operation.op === "update_spec") {
      next.spec = { ...(next.spec || {}), ...(operation.patch || {}) };
    } else if (operation.op === "append_activity") {
      next.activity.push({ time: "Now", kind: "change", message: operation.message || "Synthesis state updated." });
    }
  }
  return next;
}

export function applyProjectProposal(project) {
  if (!project?.proposal) return project;
  const next = applySynthesisPatch(project, project.proposal.operations || []);
  return { ...next, proposal: null, lastActivity: project.proposal.title };
}

export function rejectProjectProposal(project) {
  if (!project?.proposal) return project;
  const nodeId = project.proposal.nodeId;
  const operations = nodeId
    ? [
        { op: "remove_node", id: nodeId },
        { op: "append_activity", message: `${project.proposal.title} rejected.` },
      ]
    : [{ op: "append_activity", message: `${project.proposal.title} rejected.` }];
  const next = applySynthesisPatch(project, operations);
  return { ...next, proposal: null, lastActivity: `${project.proposal.title} rejected` };
}

export function synthesisProjectStats(project) {
  const nodes = asArray(project?.nodes);
  const count = (status) => nodes.filter((node) => node.status === status).length;
  const openDecisions = asArray(project?.decisions).filter((decision) => decision.status !== "resolved").length;
  return {
    held: count("held"),
    queryable: count("queryable"),
    sourceable: count("sourceable"),
    proposed: count("proposed"),
    missing: count("missing"),
    derived: count("derived"),
    openDecisions,
  };
}

export function synthesisNodeObject(project, node) {
  if (!project || !node) return null;
  return {
    kind: "synthesis_node",
    id: `${project.id}:${node.id}`,
    title: node.label,
    projectId: project.id,
    projectTitle: project.title,
    objective: project.objective,
    row: { ...node },
    project: {
      id: project.id,
      title: project.title,
      objective: project.objective,
      maturity: project.maturityLabel,
      materialisation: project.materialisation,
      decisions: asArray(project.decisions),
      edges: asArray(project.edges),
      nodes: asArray(project.nodes).map(({ id, label, type, status }) => ({ id, label, type, status })),
    },
  };
}

export function synthesisProjectObject(project) {
  if (!project) return null;
  return {
    kind: "synthesis_project",
    id: project.id,
    title: project.title,
    projectId: project.id,
    projectTitle: project.title,
    objective: project.objective,
    row: {
      maturity: project.maturityLabel,
      materialisation: project.materialisation,
      stats: synthesisProjectStats(project),
      decisions: asArray(project.decisions),
      lastActivity: project.lastActivity,
    },
    project: {
      id: project.id,
      title: project.title,
      objective: project.objective,
      maturity: project.maturityLabel,
      materialisation: project.materialisation,
      decisions: asArray(project.decisions),
      edges: asArray(project.edges),
      nodes: asArray(project.nodes).map(({ id, label, type, status }) => ({ id, label, type, status })),
    },
  };
}

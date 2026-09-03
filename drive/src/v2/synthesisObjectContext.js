export const SYNTHESIS_OBJECT_CONTEXT_EVENT = "synthesis:object-context";

const SURFACE_BY_KIND = {
  evidence: '[data-testid="synthesis-evidence-state"]',
  scope: '[data-testid="synthesis-scope-block"]',
  units: '[data-testid="synthesis-unit-conflict"]',
  join: '[data-testid="synthesis-join-decision"]',
  method: '[data-testid="synthesis-evidence-proposal"], [data-testid="synthesis-method-export"]',
  proposal: '[data-testid="synthesis-proposal-state"]',
  preview: '[data-testid="synthesis-preview-state"]',
  execution: '[data-testid="synthesis-execution-state"], [data-testid="synthesis-failed-state"]',
  result: '[data-testid="synthesis-registered-state"], [data-testid="synthesis-query-ready-state"]',
};

const KIND_LABELS = {
  evidence: "Evidence",
  scope: "Scope decision",
  units: "Unit decision",
  join: "Join decision",
  method: "Method construction",
  proposal: "Method proposal",
  preview: "Bounded Preview",
  execution: "Execution",
  result: "Registered result",
};

const TESTID_CONTEXT = {
  "synthesis-evidence-state": ["evidence", "Evidence map"],
  "synthesis-selected-field": ["evidence", "Selected evidence"],
  "synthesis-scope-block": ["scope", "Scope decision"],
  "synthesis-unit-conflict": ["units", "Unit decision"],
  "synthesis-join-decision": ["join", "Join decision"],
  "synthesis-evidence-proposal": ["method", "Method construction"],
  "synthesis-proposal-state": ["proposal", "Method proposal"],
  "synthesis-preview-state": ["preview", "Bounded Preview"],
  "synthesis-execution-state": ["execution", "Execution"],
  "synthesis-failed-state": ["execution", "Failed execution"],
  "synthesis-registered-state": ["result", "Registered result"],
  "synthesis-query-ready-state": ["result", "Query-ready result"],
  "synthesis-method-export": ["method", "Exact method artifact"],
};

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function compact(value, limit = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function surfaceTestId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (TESTID_CONTEXT[raw]) return raw;
  const match = raw.match(/^\[data-testid=["'](synthesis-[a-z0-9-]+)["']\]$/i);
  return match && TESTID_CONTEXT[match[1]] ? match[1] : "";
}

function kindFromSurface(value = "") {
  const testId = surfaceTestId(value);
  return testId ? TESTID_CONTEXT[testId]?.[0] || "" : "";
}

function kindFromActivity(value = "") {
  const text = normalized(value);
  if (!text) return "";
  if (/scope|row_limit|population/.test(text)) return "scope";
  if (/unit|rescal|normaliz|conversion/.test(text)) return "units";
  if (/join|key_overlap|fanout|many_to_many/.test(text)) return "join";
  if (/preview|bounded_test|sample_execution/.test(text)) return "preview";
  if (/proposal|method_revision|method_proposal|accepted_method/.test(text)) return "proposal";
  if (/registry|register|query_ready|library_handoff/.test(text)) return "result";
  if (/archive|manifest|build|worker|execut|materialis|materializ|approval|authoriz/.test(text)) return "execution";
  if (/method|construction|transform|aggregate|weighting/.test(text)) return "method";
  if (/measure|profil|column|schema|evidence|source|library_asset|held_input|dataset/.test(text)) return "evidence";
  return "";
}

export function selectorForSynthesisObjectContext(context = {}) {
  const explicitSurface = surfaceTestId(context.surface || context.surface_testid || context.surface_selector);
  if (explicitSurface) return `[data-testid="${explicitSurface}"]`;
  return SURFACE_BY_KIND[normalized(context.kind || context.object_kind)] || "";
}

export function enrichSynthesisObjectContext(context = {}, selected = {}) {
  if (!context || typeof context !== "object") return null;
  const threadId = compact(context.thread_id || selected.thread_id, 160);
  const kind = normalized(context.kind || context.object_kind || kindFromSurface(context.surface || context.surface_testid));
  if (!kind) return null;

  const durableIds = {
    evidence: threadId ? `${threadId}:evidence` : "",
    scope: threadId ? `${threadId}:scope` : "",
    units: threadId ? `${threadId}:units` : "",
    join: threadId ? `${threadId}:join` : "",
    method: selected.accepted_spec_hash || selected.proposal_id || selected.proposal_hash || (threadId ? `${threadId}:method` : ""),
    proposal: selected.proposal_id || selected.proposal_hash || (threadId ? `${threadId}:proposal` : ""),
    preview: selected.preview_spec_hash || selected.accepted_spec_hash || (threadId ? `${threadId}:preview` : ""),
    execution: selected.job_id || selected.run_id || (threadId ? `${threadId}:execution` : ""),
    result: selected.output_dataset_id || selected.registration_id || (threadId ? `${threadId}:result` : ""),
  };

  const surface = surfaceTestId(context.surface || context.surface_testid || context.surface_selector);
  const objectId = compact(context.object_id || context.id || durableIds[kind], 220);
  const label = compact(context.label || context.object_label || KIND_LABELS[kind] || kind, 140);
  const selector = selectorForSynthesisObjectContext({ kind, surface });
  return {
    kind,
    object_id: objectId || undefined,
    label,
    thread_id: threadId || undefined,
    surface: surface || undefined,
    selector: selector || undefined,
  };
}

export function synthesisActivityTarget(event = {}, selected = {}) {
  const row = event && typeof event === "object" ? event : { text: event };
  const explicit = row.target && typeof row.target === "object" ? row.target : {};
  const surface =
    explicit.surface || explicit.surface_testid || explicit.selector ||
    row.surface || row.surface_testid || row.target_surface || row.target_selector || "";
  const kind =
    explicit.kind || explicit.object_kind || row.object_kind || row.target_kind ||
    kindFromSurface(surface) || kindFromActivity(`${row.action || ""} ${row.text || ""}`);
  if (!kind) return null;
  return enrichSynthesisObjectContext({
    kind,
    object_id: explicit.object_id || explicit.id || row.object_id || row.target_id || "",
    label: explicit.label || explicit.object_label || row.object_label || row.target_label || "",
    surface,
  }, selected);
}

export function synthesisObjectContextPrompt(context = {}) {
  const row = enrichSynthesisObjectContext(context, context) || context;
  if (!row?.kind) return "";
  return [
    "Selected Synthesis object context:",
    `Kind: ${row.kind}.`,
    row.object_id ? `Object id: ${row.object_id}.` : "",
    row.label ? `Label: ${row.label}.` : "",
    row.surface ? `Surface: ${row.surface}.` : "",
    "Treat short references such as ‘this’, ‘that’, ‘these rows’, or ‘why’ as referring to this selected object unless the researcher clearly changes subject.",
    "Use the durable thread and measured evidence as authority; do not infer facts merely from the visual label.",
  ].filter(Boolean).join("\n");
}

export function emitSynthesisObjectContext(context = {}) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(SYNTHESIS_OBJECT_CONTEXT_EVENT, { detail: context }));
}

export function clearSynthesisObjectContextSelection() {
  if (typeof document === "undefined") return;
  document.querySelectorAll('[data-synthesis-context-selected="true"]').forEach((node) => {
    node.removeAttribute("data-synthesis-context-selected");
  });
}

export function contextFromSynthesisSurface(surface) {
  if (!surface?.getAttribute) return null;
  const testId = surface.getAttribute("data-testid") || "";
  const definition = TESTID_CONTEXT[testId];
  if (!definition) return null;
  const [kind, fallbackLabel] = definition;
  const heading = surface.querySelector("h1, h2, h3, header strong, header b, > strong");
  return {
    kind,
    label: compact(heading?.textContent || fallbackLabel),
    surface: testId,
    selector: `[data-testid="${testId}"]`,
  };
}

export function synthesisContextSurfaceSelector() {
  return Object.keys(TESTID_CONTEXT).map((testId) => `[data-testid="${testId}"]`).join(", ");
}

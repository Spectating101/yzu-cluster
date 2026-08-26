/**
 * The S-04 opening composition, from SYNTHESIS_S04_PRODUCT_SPEC.md §5–§6.
 *
 * The spec's opening state proves four things before anything is built: the
 * intent was understood, one construction is recommended, the recommendation is
 * grounded in evidence roles, and nothing has been modified yet. The page that
 * shipped instead opened on "Start one durable research object" — a composition
 * that appears nowhere in the spec, while `EXPLORATION READY`, `RESEARCH BRIEF`
 * and `EDIT INTENT` appear only in the spec and in orphaned CSS.
 *
 * Reading is separated from rendering so the absent case is testable. No
 * producer writes a recommended construction yet, so most threads will report
 * absence — and absence must read as absence, never as an empty design.
 */

/** Spec §5: the restrained opening label, before any five-stage wizard. */
export const EXPLORATION_READY = "Exploration ready";

const PRE_ACCEPTANCE = new Set(["draft_intent", "interpreting", "exploration_ready", "exploring"]);

function str(value) {
  return String(value ?? "").trim();
}

function firstOf(source, keys) {
  for (const key of keys) {
    const value = str(source?.[key]);
    if (value) return value;
  }
  return "";
}

/**
 * Spec §5: before a construction is accepted the centre must not present a
 * stage strip, and the label stays `EXPLORATION READY`.
 */
export function isPreAcceptance(thread) {
  const state = thread?.state || {};
  if (state.execution?.status) return false;
  if (state.execution_spec || state.proposal?.accepted) return false;
  const durable = str(state.durable_state || state.stage || state.status).toLowerCase().replace(/-/g, "_");
  return durable ? PRE_ACCEPTANCE.has(durable) : true;
}

/**
 * Spec §6: RESEARCH BRIEF carries the construct in the researcher's own terms,
 * plus the three commitments the recommendation is answerable to.
 */
export function researchBrief(thread) {
  const state = thread?.state || {};
  const spec = state.spec || {};
  return {
    body: firstOf(state, ["brief", "objective"]) || str(thread?.objective),
    targetGrain: firstOf(state, ["required_grain"]) || firstOf(spec, ["grain", "target_grain"]),
    targetPeriod: firstOf(state, ["target_period"]) || firstOf(spec, ["period", "target_period"]),
    intendedUse: firstOf(state, ["intended_use"]) || firstOf(spec, ["intended_use"]),
    editable: isPreAcceptance(thread),
  };
}

/**
 * Spec §6: exactly one construction is recommended, and the alternatives stay
 * counted but collapsed. A construction with no nodes is not a construction —
 * the spec's whole claim is that the recommendation is grounded in evidence
 * roles, so an empty one reports absent rather than rendering an empty frame.
 */
export function recommendedConstruction(thread) {
  const state = thread?.state || {};
  const candidates = Array.isArray(state.constructions) ? state.constructions : [];
  const chosen =
    candidates.find((c) => c?.recommended) ||
    (state.recommended_construction && typeof state.recommended_construction === "object"
      ? state.recommended_construction
      : null);
  if (!chosen) {
    return { present: false, alternatives: Math.max(candidates.length - 1, 0) };
  }
  const nodes = (Array.isArray(chosen.nodes) ? chosen.nodes : [])
    .map((n) => ({
      id: str(n?.id) || str(n?.dataset_id),
      role: str(n?.role),
      source: str(n?.source) || str(n?.label),
      grain: str(n?.grain),
    }))
    .filter((n) => n.id || n.source);
  if (!nodes.length) {
    return { present: false, alternatives: Math.max(candidates.length - 1, 0) };
  }
  return {
    present: true,
    title: str(chosen.title) || "Recommended construction",
    validationRole: str(chosen.validation_role),
    nodes,
    idealDirectMeasure: {
      label: str(chosen.ideal_direct_measure?.label),
      why: str(chosen.ideal_direct_measure?.unavailable_because),
    },
    expectedOutput: {
      label: str(chosen.expected_output?.label),
      grain: str(chosen.expected_output?.grain),
      period: str(chosen.expected_output?.period),
    },
    aiResolved: (Array.isArray(chosen.ai_resolved) ? chosen.ai_resolved : []).map(str).filter(Boolean),
    methodWillResolve: (Array.isArray(chosen.method_will_resolve) ? chosen.method_will_resolve : [])
      .map(str)
      .filter(Boolean),
    alternatives: Math.max(candidates.length - 1, 0),
  };
}

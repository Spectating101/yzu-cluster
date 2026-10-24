import { isPreAcceptance, recommendedConstruction, researchBrief } from "./synthesisBrief.js";

export function synthesisEvidenceNodes(thread) {
  return (thread?.state?.nodes || []).filter(
    (node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct",
  );
}

export function synthesisGates(thread) {
  const state = thread?.state || {};
  const brief = researchBrief(thread);
  const nodes = synthesisEvidenceNodes(thread);
  const recommendation = recommendedConstruction(thread);
  const profiles = Array.isArray(state.column_profiles) ? state.column_profiles : [];
  const proposal = state.proposal || null;
  const joinReview = Boolean((Array.isArray(state.join_candidates) && state.join_candidates.length) || state.multi_overlap);
  const objective = String(thread?.objective || state.objective || brief.purpose || "").trim();
  return [
    ["Objective", objective ? "Recorded" : "Missing", Boolean(objective)],
    ["Evidence", nodes.length ? `${nodes.length} mapped` : "Waiting", Boolean(nodes.length)],
    ["Measurement", profiles.length ? `${profiles.length} profiled` : "Not checked", Boolean(profiles.length)],
    ["Scope", state.scope_block ? "Decision needed" : profiles.length ? "No blocker" : "Not checked", Boolean(profiles.length && !state.scope_block)],
    ["Units", state.unit_conflict ? "Decision needed" : profiles.length ? "No blocker" : "Not checked", Boolean(profiles.length && !state.unit_conflict)],
    ["Join", joinReview ? "Review needed" : profiles.length ? "No blocker" : "Not checked", Boolean(profiles.length && !joinReview)],
    ["Method", proposal ? "Proposal ready" : recommendation.present ? "Recommendation" : "Not proposed", Boolean(proposal)],
  ];
}

const MEASURED_STATE_FIELDS = [
  "column_profiles",
  "column_profiles_by_dataset",
  "input_measurements",
  "unit_conflict",
  "join_candidates",
  "join_candidate_dataset_id",
  "join_candidate_rows",
  "multi_overlap",
  "unmeasured",
  "measured_inputs",
  "truncated_inputs",
  "max_inputs",
  "join_unmeasured_because",
  "input_dataset_ids",
  "measurement_basis",
];

export function threadWithMeasurements(thread, measurements) {
  if (!thread || !measurements || !isPreAcceptance(thread)) return thread;
  const measured = {};
  MEASURED_STATE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(measurements, field)) measured[field] = measurements[field];
  });
  if (!Object.prototype.hasOwnProperty.call(measured, "unit_conflict")) measured.unit_conflict = null;
  if (!Object.prototype.hasOwnProperty.call(measured, "join_candidates")) measured.join_candidates = [];
  if (!Object.prototype.hasOwnProperty.call(measured, "join_candidate_dataset_id")) measured.join_candidate_dataset_id = null;
  if (!Object.prototype.hasOwnProperty.call(measured, "join_candidate_rows")) measured.join_candidate_rows = null;
  if (!Object.prototype.hasOwnProperty.call(measured, "multi_overlap")) measured.multi_overlap = null;
  return { ...thread, state: { ...(thread.state || {}), ...measured } };
}

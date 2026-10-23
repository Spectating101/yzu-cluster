import { recommendedConstruction, researchBrief } from "./synthesisBrief.js";

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

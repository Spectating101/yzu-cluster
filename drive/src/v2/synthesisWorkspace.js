import { synthesisAssist } from "./synthesisAssist.js";
import { synthesisJourneyStage } from "./synthesisLifecycle.js";

function text(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function normalizeStatus(value) {
  return text(value).toLowerCase().replace(/[ -]+/g, "_");
}

export function synthesisWorkspaceExecutionStatus(thread) {
  return normalizeStatus(thread?.state?.execution?.status);
}

export function synthesisWorkspacePhase(thread) {
  if (synthesisWorkspaceExecutionStatus(thread) === "failed") return "failed";
  return synthesisJourneyStage(thread);
}

const DECISION_KINDS = new Set([
  "resolve_scope",
  "resolve_units",
  "resolve_join",
  "review_recommendation",
  "review_proposal",
  "run_preview",
  "recover_preview",
  "review_preview",
  "approve_execution",
  "recover_build",
]);

export function synthesisWorkspaceNeedsDecision(thread) {
  return DECISION_KINDS.has(synthesisAssist(thread).decisionKind);
}

export function synthesisWorkspacePhaseLabel(thread) {
  const assist = synthesisAssist(thread);
  const phase = synthesisWorkspacePhase(thread);
  if (phase === "failed") return "Needs recovery";
  if (phase === "build") return text(thread?.state?.execution?.status, "Build in progress").replace(/_/g, " ");
  if (phase === "result") {
    return synthesisWorkspaceExecutionStatus(thread) === "query_ready" ? "Query-ready result" : "Registered result";
  }
  return assist.status || assist.label || "Durable construction";
}

export function synthesisWorkspaceActionLabel(thread) {
  const assist = synthesisAssist(thread);
  switch (assist.decisionKind) {
    case "resolve_scope": return "Resolve scope";
    case "resolve_units": return "Resolve units";
    case "resolve_join": return "Resolve join";
    case "review_recommendation": return "Review recommendation";
    case "review_proposal": return "Review proposal";
    case "run_preview": return assist.status === "Preview stale" ? "Rerun Preview" : "Run Preview";
    case "recover_preview": return "Inspect Preview";
    case "review_preview": return "Review Preview";
    case "approve_execution": return "Review approval";
    case "recover_build": return "Inspect failure";
    case "await_registration": return "View registration";
    case "open_result": return "Open result";
    case "map_evidence": return "Continue evidence";
    case "design_method": return "Continue method";
    default: break;
  }
  const phase = synthesisWorkspacePhase(thread);
  if (phase === "failed") return "Inspect failure";
  if (phase === "build") return "View build";
  if (phase === "result") return "Open result";
  return "Continue";
}

function sortNewest(rows) {
  return [...rows].sort((a, b) => {
    const left = new Date(a?.updated_at || a?.created_at || 0).getTime() || 0;
    const right = new Date(b?.updated_at || b?.created_at || 0).getTime() || 0;
    return right - left;
  });
}

export function partitionSynthesisWorkspace(threads = []) {
  const all = Array.isArray(threads) ? threads : [];
  const needsYou = sortNewest(all.filter((thread) => synthesisWorkspaceNeedsDecision(thread)));
  const building = sortNewest(all.filter(
    (thread) => synthesisWorkspacePhase(thread) === "build" && synthesisWorkspaceExecutionStatus(thread) !== "failed",
  ));
  const results = sortNewest(all.filter((thread) => synthesisWorkspacePhase(thread) === "result"));
  const active = sortNewest(all.filter((thread) => {
    if (synthesisWorkspaceNeedsDecision(thread)) return false;
    return !["build", "result"].includes(synthesisWorkspacePhase(thread));
  }));
  return {
    needsYou,
    active,
    building,
    results,
    continueThread: needsYou[0] || active[0] || building[0] || results[0] || null,
  };
}

// Research Drive faculty-facing product language.
// Technical truth remains available in Detail/operator surfaces; primary views
// describe the governed research objects and outcomes users actually act on.

export const RESEARCH_OBJECTS = Object.freeze({
  construction: "Research construction",
  asset: "Evidence asset",
  gap: "Evidence gap",
  acquisition: "Acquisition plan",
  decision: "Research decision",
});

export const RESEARCH_LIFECYCLE = Object.freeze([
  "Research question",
  "Research construction",
  "Evidence already held",
  "Evidence missing",
  "Available acquisition routes",
  "Human-approved execution",
  "Verified and registered asset",
  "Reusable analytical evidence",
  "Construction unblocked",
]);

const FACULTY_STATE = Object.freeze({
  registered: "Safely held in the research estate",
  query_ready: "Ready for analysis",
  "query-ready": "Ready for analysis",
  claimed: "Collection started",
  running: "Collection in progress",
  queued: "Collection queued",
  pending_approval: "Waiting for your decision",
  pending: "Waiting for your decision",
  archive_verified: "Evidence preserved",
  registry_verified: "Evidence indexed and traceable",
  failed: "Needs recovery",
  blocked: "Blocked",
});

export function facultyStateLabel(value, fallback = "State not yet established") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return FACULTY_STATE[normalized] || fallback;
}

export const RESEARCH_ACTIONS = Object.freeze({
  continueConstruction: "Continue construction",
  inspectEvidence: "Inspect evidence",
  startAcquisition: "Start acquisition",
  reviewAcquisition: "Review acquisition plan",
  askAsset: "Ask about this asset",
  askConstruction: "Ask about this construction",
  addToConstruction: "Add to construction",
  chooseRoute: "Choose acquisition route",
  reviewDecision: "Review research decision",
});

export function namedAction(verb, objectName) {
  const action = String(verb || "").trim();
  const object = String(objectName || "").trim();
  if (!action) return object;
  if (!object) return action;
  return `${action} ${object}`;
}

export function evidenceLineageLabel(stage) {
  const labels = {
    source: "Source",
    acquisition: "Acquisition",
    verification: "Verification",
    asset: "Evidence asset",
    construction: "Research construction",
  };
  return labels[String(stage || "").trim().toLowerCase()] || "Research state";
}

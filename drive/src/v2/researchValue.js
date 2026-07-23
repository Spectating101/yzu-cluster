// Research Drive faculty-facing product language.
// Primary views translate only specific authoritative backend states. Ambiguous
// states remain visibly unestablished instead of being cosmetically upgraded.

export const RESEARCH_OBJECTS = Object.freeze({
  construction: "Research construction",
  asset: "Evidence asset",
  gap: "Evidence gap",
  acquisition: "Acquisition plan",
  decision: "Research decision",
});

export const RESEARCH_RELATIONSHIPS = Object.freeze({
  constructionRequires: "requires",
  constructionHolds: "holds",
  constructionProposes: "proposes",
  constructionWaitsFor: "waits for",
  acquisitionProduces: "produces",
  assetUnblocks: "unblocks",
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
  held: "Held evidence",
  queryable: "Connected and queryable",
  query_ready: "Ready for analysis",
  claimed: "Assigned to a collection worker",
  queued: "Approved and awaiting execution",
  running: "Collection in progress",
  registering: "Evidence registration in progress",
  archiving: "Evidence preservation in progress",
  pending_approval: "Waiting for your decision",
  archive_verified: "Evidence preserved",
  registry_verified: "Evidence indexed and traceable",
  registered: "Indexed in the research estate",
  sourceable: "Acquisition route available",
  needs_access: "Access required",
  failed: "Needs recovery",
  blocked: "Blocked",
});

export function normalizeResearchState(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function facultyStateLabel(value, authorityOrFallback = {}, fallback = "State not yet established") {
  const authority = typeof authorityOrFallback === "object" && authorityOrFallback !== null ? authorityOrFallback : {};
  const resolvedFallback = typeof authorityOrFallback === "string" ? authorityOrFallback : fallback;
  const normalized = normalizeResearchState(value);

  if (!normalized) return resolvedFallback;
  if (normalized === "pending") return "Pending state; decision authority not established";
  if (normalized === "unknown") return "State not established";
  if (normalized === "registered" && authority.archiveVerified && authority.registryVerified) {
    return "Verified and indexed in the research estate";
  }
  return FACULTY_STATE[normalized] || `${resolvedFallback}: ${normalized.replace(/_/g, " ")}`;
}

export const RESEARCH_ACTIONS = Object.freeze({
  continueConstruction: "Continue construction",
  inspectEvidence: "Inspect evidence asset",
  startAcquisition: "Start acquisition",
  reviewAcquisition: "Review acquisition plan",
  askAsset: "Ask about this evidence asset",
  askConstruction: "Develop construction in Composer",
  addToConstruction: "Add evidence to construction",
  chooseRoute: "Choose acquisition route",
  reviewDecision: "Review research decision",
  investigateGap: "Investigate evidence gap",
  requestExecution: "Request governed execution",
});

export function namedAction(verb, objectName) {
  const action = String(verb || "").trim();
  const object = String(objectName || "").trim();
  if (!action || !object) return "Action unavailable";
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

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function uniqueStrings(values = [], limit = 4) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, limit);
}

const COPY = {
  verified: {
    label: "Verified",
    kind: "verified",
    body: "A durable verification record is attached to this owned evidence.",
  },
  matched: {
    label: "Matched",
    kind: "matched",
    body: "A durable comparison records correspondence with sourcable evidence.",
  },
  partial: {
    label: "Partial",
    kind: "partial",
    body: "A durable comparison records only partial correspondence; inspect the remaining differences before reuse.",
  },
  unverified: {
    label: "Unverified",
    kind: "unverified",
    body: "A verification attempt did not establish correspondence with authoritative or sourcable evidence.",
  },
  not_checked: {
    label: "Not checked",
    kind: "unchecked",
    body: "No durable source-comparison claim has been established for this asset.",
  },
};

/**
 * Canonical Library verification claim.
 *
 * Verification is deliberately independent from readiness, archive presence,
 * and queryability. Every Library surface must consume this helper rather than
 * infer verification from a status/readiness pill.
 */
export function libraryVerification(dataset = {}) {
  const nested = dataset.verification && typeof dataset.verification === "object" ? dataset.verification : {};
  const sourceMatch = dataset.source_match && typeof dataset.source_match === "object" ? dataset.source_match : {};
  const raw =
    dataset.verification_status ||
    dataset.verification_state ||
    dataset.source_verification ||
    dataset.source_match_status ||
    nested.status ||
    nested.state ||
    sourceMatch.status ||
    sourceMatch.state ||
    "";
  const normalized = normalizeToken(raw);
  const key = COPY[normalized]
    ? normalized
    : ["unchecked", "not_checked", "none", "unknown", ""].includes(normalized)
      ? "not_checked"
      : "not_checked";
  const canonical = COPY[key];
  const checks = uniqueStrings([
    ...(Array.isArray(nested.checks) ? nested.checks : []),
    ...(Array.isArray(nested.established) ? nested.established : []),
    ...(Array.isArray(sourceMatch.checks) ? sourceMatch.checks : []),
  ]);
  const unknowns = uniqueStrings([
    ...(Array.isArray(nested.unknowns) ? nested.unknowns : []),
    ...(Array.isArray(sourceMatch.unknowns) ? sourceMatch.unknowns : []),
  ]);
  const note = String(
    nested.summary ||
      nested.reason ||
      sourceMatch.summary ||
      sourceMatch.reason ||
      dataset.verification_summary ||
      "",
  ).trim();

  return {
    key,
    kind: canonical.kind,
    label: canonical.label,
    body: note || canonical.body,
    checks,
    unknowns: key === "not_checked" && !unknowns.length ? ["Source correspondence not established"] : unknowns,
    explicit: Boolean(normalized && !["unchecked", "not_checked", "none", "unknown"].includes(normalized)),
  };
}

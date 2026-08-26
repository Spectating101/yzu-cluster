/**
 * What a join would do to the study, before it is added.
 *
 * Cardinality is the question people ask about a join. Coverage is the one that
 * decides the result only after the candidate identifies the intended grain. A
 * constant identifier can have 100% overlap and still identify almost nothing.
 * Complete entity-period grain therefore wins first, then the candidate that
 * distinguishes the most observations across both sides, then coverage.
 *
 * A collapse strategy is only offered when the right side actually duplicates the
 * key. Offering it otherwise asks the researcher to rule on a situation that does
 * not exist.
 */

export const WEAK_COVERAGE = 60;
export const STRONG_COVERAGE = 95;

export function rankCandidates(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const total = row?.left_distinct ?? null;
      const rightTotal = row?.right_distinct ?? null;
      const derivedCapacity = total == null || rightTotal == null
        ? 0
        : Math.min(Number(total || 0), Number(rightTotal || 0));
      return {
        leftKey: String(row?.left_key || ""),
        rightKey: String(row?.right_key || ""),
        keyParts: Array.isArray(row?.key_parts) ? row.key_parts.map((part) => String(part)) : [],
        completeIdentityDomain: Boolean(row?.complete_identity_domain),
        identityCapacity: Number(row?.identity_capacity ?? derivedCapacity),
        leftDatasetId: String(row?.left_dataset_id || ""),
        rightDatasetId: String(row?.right_dataset_id || ""),
        leftLabel: String(row?.left_label || ""),
        rightLabel: String(row?.right_label || ""),
        matched: row?.matched ?? null,
        total,
        rightTotal,
        coverage: row?.match_rate_pct ?? null,
        duplicates: row?.right_duplicate_rows ?? 0,
        usable: Boolean(row?.usable),
        reason: row?.reason || null,
      };
    })
    .sort((a, b) => {
      if (a.usable !== b.usable) return a.usable ? -1 : 1;
      if (a.completeIdentityDomain !== b.completeIdentityDomain) {
        return a.completeIdentityDomain ? -1 : 1;
      }
      const capacityDelta = b.identityCapacity - a.identityCapacity;
      if (capacityDelta) return capacityDelta;
      const coverageDelta = (b.coverage ?? -1) - (a.coverage ?? -1);
      if (coverageDelta) return coverageDelta;
      return a.leftKey.localeCompare(b.leftKey);
    });
}

export function coverageVerdict(candidate) {
  if (!candidate || !candidate.usable) return "unusable";
  const coverage = Number(candidate.coverage || 0);
  if (coverage >= STRONG_COVERAGE) return "strong";
  if (coverage >= WEAK_COVERAGE) return "partial";
  return "weak";
}

/**
 * Three outcomes, each stated as what happens to the study rather than to the rows.
 */
export function joinOutcomes(candidate) {
  const matched = Number(candidate?.matched || 0);
  const total = Number(candidate?.total || 0);
  const lost = Math.max(total - matched, 0);
  const share = total ? Math.round((matched / total) * 100) : 0;
  const verdict = coverageVerdict(candidate);
  return [
    {
      id: "inner",
      label: "inner join",
      keeps: matched,
      consequence:
        verdict === "strong"
          ? `keeps ${matched.toLocaleString()} of ${total.toLocaleString()}`
          : `${total.toLocaleString()} → ${matched.toLocaleString()}, a different population`,
      recommended: verdict === "strong",
    },
    {
      id: "left",
      label: "left join",
      keeps: total,
      consequence: lost
        ? `all ${total.toLocaleString()} kept; ${lost.toLocaleString()} carry blanks, so any metric over them is computed on ${share}% of rows`
        : `all ${total.toLocaleString()} kept, nothing blank`,
      recommended: verdict === "partial",
    },
    {
      id: "skip",
      label: "skip this join",
      keeps: total,
      consequence:
        verdict === "weak"
          ? "it costs more than it adds; recorded as a limitation"
          : "no added fields, no rows lost",
      recommended: verdict === "weak" || verdict === "unusable",
    },
  ];
}

export function needsCollapse(candidate) {
  return Number(candidate?.duplicates || 0) > 0;
}

export function collapseChoices(candidate) {
  if (!needsCollapse(candidate)) return [];
  const duplicates = Number(candidate.duplicates || 0);
  return [
    { id: "error", label: "refuse the join", detail: "stop rather than guess which row wins", recommended: true },
    { id: "first", label: "first match", detail: `deterministic, arbitrary · ${duplicates.toLocaleString()} extra right rows` },
    { id: "last", label: "last match", detail: "deterministic, arbitrary" },
  ];
}

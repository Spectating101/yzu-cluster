/**
 * What the thread has accumulated: who decided what, where it has been, and what
 * a second version would change.
 *
 * Three surfaces share one shape. Every entry carries an authority — observed
 * from the data, chosen by the desk, or chosen by the researcher — because that
 * is what makes a decision contestable rather than merely listed. Silence assents
 * to a desk choice, so a desk choice must always be visible and always reversible.
 *
 * Nothing here is styled as a warning. A settled decision is not a problem; it is
 * the record that makes the output citable.
 */

export const AUTHORITY = {
  observed: { label: "observed", contestable: false, note: "established from the data" },
  desk: { label: "the desk chose", contestable: true, note: "resolved for you, and reversible" },
  researcher: { label: "you chose", contestable: true, note: "your decision" },
};

export function settledDecisions(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const key = String(entry?.authority || "desk");
    const authority = AUTHORITY[key] || AUTHORITY.desk;
    return {
      id: String(entry?.id || `decision-${index}`),
      summary: String(entry?.summary || ""),
      evidence: String(entry?.evidence || ""),
      authority: key,
      authorityLabel: authority.label,
      contestable: authority.contestable,
      note: authority.note,
    };
  });
}

export function contestableCount(decisions) {
  return decisions.filter((decision) => decision.contestable).length;
}

/**
 * A trip to another surface is only worth recording if it changed what the thread
 * knows. "Searched and found nothing" is a result; returning to an identical
 * screen is the defect this exists to prevent.
 */
export function excursionEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const found = Number(entry?.found ?? 0);
    return {
      id: String(entry?.id || `excursion-${index}`),
      at: String(entry?.at || ""),
      surface: String(entry?.surface || "Discover"),
      searched: String(entry?.searched || ""),
      found,
      verdict: String(entry?.verdict || (found ? "candidate found" : "nothing found")),
      resolved: Boolean(entry?.resolved),
    };
  });
}

export function excursionSummary(entries) {
  if (!entries.length) return "";
  const unresolved = entries.filter((entry) => !entry.resolved).length;
  return unresolved
    ? `${entries.length} searched · ${unresolved} still open`
    : `${entries.length} searched · all resolved`;
}

/**
 * A revision inherits every settled decision and asks only about the difference.
 * The prior version stays registered and citable — a new build is a revision, not
 * an overwrite.
 */
export function reuseDiff(source, changes) {
  const carried = settledDecisions(source?.decisions);
  const changed = (Array.isArray(changes) ? changes : []).map((change) => ({
    id: String(change?.id || ""),
    label: String(change?.label || ""),
    before: change?.before ?? null,
    after: change?.after ?? null,
    changed: String(change?.before ?? "") !== String(change?.after ?? ""),
  }));
  const moved = changed.filter((change) => change.changed);
  return {
    from: String(source?.method_hash || ""),
    carried,
    carriedCount: carried.length - moved.length,
    changes: changed,
    moved,
    unchanged: changed.filter((change) => !change.changed),
    citable: true,
  };
}

export function shortHash(value, length = 8) {
  const text = String(value || "").replace(/^sha256:/, "");
  return text ? `sha256:${text.slice(0, length)}…` : "";
}

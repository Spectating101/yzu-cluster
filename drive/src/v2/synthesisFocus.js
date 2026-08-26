/**
 * One screen, one subject.
 *
 * The page had grown to twelve panels that each rendered whenever their own field
 * was present, in source order, with nothing arbitrating between them. That
 * produced screens where "CANNOT BUILD" sat directly above "Interpretation in
 * progress · Continue in Ask" — both correct alone, contradictory together,
 * because no layer decided what the screen was about.
 *
 * So the state picks a subject. Everything else that has something to say becomes
 * one line in a strip, and the researcher can promote any of them. A blocking
 * refusal outranks a pending decision, which outranks a report, which outranks
 * the waiting state — because that is the order in which they stop being true.
 */

/**
 * A refusal that happened before a build cannot still be true after one.
 *
 * Ranking by severity alone made a registered thread render CANNOT BUILD, because
 * a leftover scope_block outranked its own execution status. Severity says which
 * of two live things matters more; it says nothing about whether a field is still
 * current. So relevance is checked first and severity second.
 *
 * Scope, units and join coverage are all inputs to a build. Once one has run,
 * they describe a question that was already answered — whatever the field still
 * holds. A proposal is different: a registered thread can legitimately carry a new
 * one, because a revision starts that way.
 */
export const PRE_BUILD = ["scope", "units", "join", "columns"];

export function hasExecuted(state) {
  return Boolean(String(state?.execution?.status || "").trim());
}

export function isStale(subjectId, state) {
  return PRE_BUILD.includes(subjectId) && hasExecuted(state);
}

export const SUBJECTS = [
  { id: "scope", panel: "scope", label: "cannot build",
    when: (s) => Boolean(s?.scope_block && Number(s.scope_block.rows) > Number(s.scope_block.limit)) },
  { id: "units", panel: "units", label: "units need you",
    when: (s) => Boolean(s?.unit_conflict?.left && s?.unit_conflict?.right) },
  { id: "failed", panel: "execution", label: "execution failed",
    when: (s) => String(s?.execution?.status || "") === "failed" },
  { id: "proposal", panel: "proposal", label: "proposal to review",
    when: (s) => Boolean(s?.proposal) },
  { id: "join", panel: "join", label: "join needs review",
    when: (s) => Boolean((s?.join_candidates || []).length) },
  { id: "building", panel: "execution", label: "building",
    when: (s) => ["queued", "running", "registering", "archiving"].includes(String(s?.execution?.status || "")) },
  { id: "ready", panel: "execution", label: "registered",
    when: (s) => ["registered", "query_ready"].includes(String(s?.execution?.status || "")) },
  { id: "evidence", panel: "evidence", label: "evidence mapped",
    when: (s) => Boolean((s?.nodes || []).length) },
  { id: "draft", panel: "draft", label: "interpreting", when: () => true },
];

/** Never the natural subject, but the researcher can promote any of them. */
export const PROMOTABLE = [
  { id: "columns", panel: "columns", label: "columns",
    when: (s) => Boolean((s?.column_profiles || []).length) },
  { id: "excursions", panel: "excursions", label: "went looking",
    when: (s) => Boolean((s?.excursions || []).length) },
  { id: "settled", panel: "settled", label: "settled decisions",
    when: (s) => Boolean((s?.settled_decisions || []).length) },
  { id: "provenance", panel: "provenance", label: "provenance",
    when: (s) => Boolean(s?.provenance?.method_hash) },
  { id: "reuse", panel: "reuse", label: "reuse",
    when: (s) => Boolean(s?.reuse_from) },
];

const STRIP = [
  { id: "scope", label: "scope", summary: (s) =>
      s.scope_block ? `${Number(s.scope_block.rows).toLocaleString()} rows · over the limit` : "" },
  { id: "units", label: "units", summary: (s) =>
      s.unit_conflict ? `${s.unit_conflict.left?.column} and ${s.unit_conflict.right?.column} disagree` : "" },
  { id: "columns", label: "columns", summary: (s) => {
      const profiles = s.column_profiles || [];
      if (!profiles.length) return "";
      const flagged = profiles.filter((p) => (p.flags || []).length).length;
      return `${(s.columns_in_use || []).length} of ${profiles.length} in use · ${flagged} resolved`;
    } },
  { id: "join", label: "join needs review", summary: (s) => {
      const best = (s.join_candidates || [])[0];
      if (!best) return "";
      const matched = Number(best.matched);
      const total = Number(best.left_distinct ?? best.total);
      const repeated = Number(best.right_duplicate_rows) > 0;
      const fanout = Number(best.fanout_multiplier);
      const coverage = Number.isFinite(matched) && Number.isFinite(total) && total > 0
        ? `${matched.toLocaleString()}/${total.toLocaleString()} identifiers match`
        : `${best.match_rate_pct}% identifier coverage`;
      const consequence = Number.isFinite(fanout) && fanout > 1
        ? ` · matched rows fan out ${fanout.toLocaleString()}×`
        : repeated ? " · repeated right key" : "";
      return `${coverage}${consequence}`;
    } },
  { id: "excursions", label: "went looking", summary: (s) =>
      (s.excursions || []).length ? `${s.excursions.length} searched` : "" },
  { id: "settled", label: "settled", summary: (s) =>
      (s.settled_decisions || []).length ? `${s.settled_decisions.length} decisions` : "" },
  { id: "provenance", label: "provenance", summary: (s) =>
      s.provenance?.method_hash ? "method and fingerprints" : "" },
  { id: "reuse", label: "reuse", summary: (s) => (s.reuse_from ? "start a revision" : "") },
];

export function focusFor(state, promoted = "") {
  const s = state || {};
  const live = (subject) => subject.when(s) && !isStale(subject.id, s);
  const natural = SUBJECTS.find(live) || SUBJECTS[SUBJECTS.length - 1];
  const chosen = promoted && [...SUBJECTS, ...PROMOTABLE]
    .find((subject) => subject.id === promoted && live(subject));
  const subject = chosen || natural;
  const strip = STRIP
    .filter((item) => item.id !== subject.id && !isStale(item.id, s))
    .map((item) => ({ id: item.id, label: item.label, summary: item.summary(s) }))
    .filter((item) => item.summary);
  return {
    subject: subject.id,
    panel: subject.panel,
    label: subject.label,
    blocking: subject.id === "scope" || subject.id === "units",
    promoted: Boolean(chosen && chosen.id !== natural.id),
    natural: natural.id,
    strip,
  };
}

/** A waiting state is not worth showing beside a refusal that already happened. */
export function showsDraft(focus) {
  return focus.subject === "draft";
}

const arr = (v) => Array.isArray(v);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v) => typeof v === "string" && v.trim() !== "";
const bool = (v) => typeof v === "boolean";
const obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const FIELDS = {
  scope_block: {
    panel: "synthesis-scope-block",
    produces: "a construction whose row count exceeds MAX_OUTPUT_ROWS",
    check: (v, p) => {
      if (!obj(v)) return p("must be an object");
      if (!num(v.rows)) p("rows must be a number: the constructed row count before any cut");
      if (!num(v.limit)) p("limit must be a number: the executor's MAX_OUTPUT_ROWS");
      if (!arr(v.options)) return p("options must be an array (may be empty)");
      v.options.forEach((o, i) => {
        if (!str(o?.id)) p(`options[${i}].id must be a non-empty string`);
        if (!num(o?.rows)) p(`options[${i}].rows must be the row count that cut leaves`);
      });
    },
  },
  unit_conflict: {
    panel: "synthesis-unit-conflict",
    produces: "two columns whose typical magnitudes differ by ~100x",
    check: (v, p) => {
      if (!obj(v)) return p("must be an object");
      for (const side of ["left", "right"]) {
        if (!obj(v[side])) { p(`${side} must be an object`); continue; }
        if (!str(v[side].column)) p(`${side}.column must name the column`);
        if (!num(v[side].typical)) p(`${side}.typical must be the representative magnitude`);
      }
      if (!arr(v.outcomes) || !v.outcomes.length) return p("outcomes must be a non-empty array");
      v.outcomes.forEach((o, i) => {
        if (!str(o?.id)) p(`outcomes[${i}].id must be a non-empty string`);
        if (!str(o?.label)) p(`outcomes[${i}].label must read as a choice`);
        if (!num(o?.result)) p(`outcomes[${i}].result must be the number that choice yields`);
      });
      if (v.outcomes.filter((o) => o?.recommended).length > 1) p("at most one outcome may be recommended");
    },
  },
  column_profiles: {
    panel: "synthesis-method-surface",
    produces: "synthesis.data_profile.profile_columns()",
    check: (v, p) => {
      if (!arr(v)) return p("must be an array");
      v.forEach((c, i) => {
        if (!str(c?.column)) p(`[${i}].column must name the column`);
        if (!str(c?.kind)) p(`[${i}].kind must be a column kind`);
        if (!num(c?.rows)) p(`[${i}].rows must be a number`);
        if (!num(c?.blanks)) p(`[${i}].blanks must be a number`);
        if (!num(c?.distinct)) p(`[${i}].distinct must be a number`);
        if (!arr(c?.flags)) p(`[${i}].flags must be an array (lookahead, unit_twin, sparse, score, empty, constant)`);
      });
    },
  },
  columns_in_use: {
    panel: "synthesis-method-surface",
    produces: "the columns the accepted spec actually reads",
    check: (v, p) => {
      if (!arr(v)) return p("must be an array of column names");
      v.forEach((c, i) => { if (!str(c)) p(`[${i}] must be a non-empty string`); });
    },
  },
  join_candidates: {
    panel: "synthesis-join-decision",
    produces: "synthesis.data_profile.join_coverage()",
    check: (v, p) => {
      if (!arr(v)) return p("must be an array, ranked best first");
      v.forEach((c, i) => {
        if (!str(c?.left_key)) p(`[${i}].left_key must name the left column`);
        if (!str(c?.right_key)) p(`[${i}].right_key must name the right column`);
        if (!num(c?.matched)) p(`[${i}].matched must be the matched distinct-key count`);
        if (!num(c?.left_distinct)) p(`[${i}].left_distinct must be the left distinct-key count`);
        if (!num(c?.match_rate_pct)) p(`[${i}].match_rate_pct must be a percentage, not a fraction`);
        if (!num(c?.right_duplicate_rows)) p(`[${i}].right_duplicate_rows must be a number (0 when the right side is unique)`);
        if (!bool(c?.usable)) p(`[${i}].usable must be a boolean`);
        if (c?.usable === false && !str(c?.reason)) p(`[${i}].reason must say why it is unusable`);
      });
    },
  },
  settled_decisions: {
    panel: "synthesis-settled-decisions",
    produces: "decisions already taken on this thread",
    check: (v, p) => {
      if (!arr(v)) return p("must be an array");
      v.forEach((d, i) => {
        if (!str(d?.id)) p(`[${i}].id must be a non-empty string`);
        if (!["observed", "desk"].includes(d?.authority)) p(`[${i}].authority must be "observed" (the data settled it) or "desk" (a choice, so contestable)`);
        if (!str(d?.summary)) p(`[${i}].summary must state the decision`);
      });
    },
  },
  excursions: {
    panel: "synthesis-excursion-record",
    produces: "searches this thread made for more evidence",
    check: (v, p) => {
      if (!arr(v)) return p("must be an array");
      v.forEach((e, i) => {
        if (!str(e?.id)) p(`[${i}].id must be a non-empty string`);
        if (!str(e?.searched)) p(`[${i}].searched must say what was looked for`);
        if (!num(e?.found)) p(`[${i}].found must be a count, 0 when nothing was found`);
        if (!str(e?.verdict)) p(`[${i}].verdict must say why it did or did not help`);
      });
    },
  },
  provenance: {
    panel: "synthesis-provenance",
    produces: "the registered execution's method record",
    check: (v, p) => {
      if (!obj(v)) return p("must be an object");
      if (!str(v.method_hash)) p("method_hash must be the method fingerprint");
      if (!arr(v.inputs)) return p("inputs must be an array");
      v.inputs.forEach((n, i) => {
        if (!str(n?.dataset_id)) p(`inputs[${i}].dataset_id must name the input dataset`);
        if (!str(n?.fingerprint)) p(`inputs[${i}].fingerprint must be the input fingerprint`);
      });
      if (v.archive_verified !== undefined && !bool(v.archive_verified)) p("archive_verified must be a boolean when present");
    },
  },
  reuse_from: {
    panel: "synthesis-reuse",
    produces: "the prior method this thread is a revision of",
    check: (v, p) => {
      if (!obj(v)) return p("must be an object");
      if (!str(v.method_hash)) p("method_hash must identify the prior method");
      if (!str(v.output_dataset_id)) p("output_dataset_id must name what the prior method produced");
      if (!arr(v.decisions)) p("decisions must be the settled decisions the revision inherits");
    },
  },
  reuse_changes: {
    panel: "synthesis-reuse",
    produces: "what differs between the prior method and this revision",
    check: (v, p) => {
      if (!arr(v)) return p("must be an array");
      v.forEach((c, i) => {
        if (!str(c?.label)) p(`[${i}].label must name what changed`);
        if (c?.before === undefined) p(`[${i}].before must be present, even when equal to after`);
        if (c?.after === undefined) p(`[${i}].after must be present`);
      });
    },
  },
};

export function validateThreadState(state) {
  const problems = [];
  const s = state || {};
  for (const [field, spec] of Object.entries(FIELDS)) {
    if (s[field] === undefined || s[field] === null) continue;
    spec.check(s[field], (problem) => problems.push({ field, problem, panel: spec.panel }));
  }
  return problems;
}

export function contractCoverage(state) {
  const s = state || {};
  const present = Object.keys(FIELDS).filter((f) => s[f] !== undefined && s[f] !== null);
  return {
    present,
    absent: Object.keys(FIELDS).filter((f) => !present.includes(f)),
    panels: [...new Set(present.map((f) => FIELDS[f].panel))],
  };
}

export const EXAMPLE_STATE = {
  scope_block: { rows: 1043042, limit: 1000000,
    options: [{ id: "2020", from: "2020-01-01", rows: 969392 },
              { id: "2023", from: "2023-01-01", rows: 506163 }] },
  unit_conflict: {
    left: { column: "return_1d", typical: 0.0006 },
    right: { column: "rf", typical: 0.012 },
    outcomes: [{ id: "rescale", label: "rescale rf ÷100", result: -0.0002, recommended: true },
               { id: "asis", label: "leave them as they are", result: -0.02 }] },
  column_profiles: [
    { column: "date", kind: "date", rows: 100, blanks: 0, distinct: 90, flags: [] },
    { column: "fwd_5d", kind: "measurement", rows: 100, blanks: 0, distinct: 90, flags: ["lookahead"] }],
  columns_in_use: ["date", "return_1d"],
  join_candidates: [
    { left_key: "yahoo_symbol", right_key: "yahoo_symbol", matched: 50, left_distinct: 635,
      match_rate_pct: 7.874, right_duplicate_rows: 0, usable: true, reason: null },
    { left_key: "yahoo_symbol", right_key: "isin", matched: 0, left_distinct: 635,
      match_rate_pct: 0, right_duplicate_rows: 0, usable: false,
      reason: "the column is empty on the right side" }],
  settled_decisions: [
    { id: "grain", authority: "observed", summary: "target grain asset × week" },
    { id: "asof", authority: "desk", summary: "as-of backward 5D", evidence: "100.0% matched" }],
  excursions: [{ id: "e1", at: "2026-08-18", searched: "regulatory filings", found: 1,
                 verdict: "grain incompatible" }],
  provenance: { method_hash: "sha256:dd997b185c521d70e38557b", built_at: "2026-08-18 19:43 UTC",
    job_id: "job-synthesis-42", archive_verified: true,
    inputs: [{ dataset_id: "idn_fry_daily_cross_section", fingerprint: "aa312a7412", files: 1, bytes: 35388 }],
    code_excerpt: "frame = pd.merge_asof(frame, ff, on='date', direction='backward')" },
  reuse_from: { method_hash: "sha256:dd997b185c521d70", output_dataset_id: "idn_weekly_factor_exposure",
    decisions: [{ id: "grain", authority: "observed", summary: "asset × week" }] },
  reuse_changes: [{ id: "metrics", label: "metrics", before: "5 defined", after: "7 defined" }],
};

/**
 * What the evidence panel says about a dataset's columns.
 *
 * The backend profiler reports facts — kind, blanks, distinct, flags. This turns
 * them into the sentences a researcher reads, and decides what the panel shows by
 * default. The default is not the column list: it is the three columns in use plus
 * a count of what was resolved without asking. A thirty-five row table is a
 * data-engineering view and belongs behind "review all".
 *
 * No word here is a dtype. "ORDINAL" and "nonnull 99.9%" are column properties;
 * "a score with 6 levels" and "481 rows are blank" are what the reader needs.
 */

const KIND_PHRASE = {
  date: () => "a date",
  label: (c) => `a label · ${c.distinct} kinds`,
  name: (c) => `a name · ${c.distinct.toLocaleString()} of them`,
  "yes/no": () => "yes / no",
  score: (c) => `a score with ${c.distinct} levels`,
  measurement: (c) => `a measurement · ${c.distinct.toLocaleString()} values`,
  constant: () => "one value throughout",
};

const FLAG_REASON = {
  lookahead: () => "tells you the future",
  unit_twin: (c) => `the same series as ${c.twin_of || "its twin"}, about 100× apart`,
  sparse: (c) => `blank in ${Math.round((c.blanks / c.rows) * 100)}% of rows`,
  score: () => "averaging this averages a code",
  empty: () => "never populated",
  constant: () => "cannot separate anything",
};

const GROUP_ORDER = ["lookahead", "unit_twin", "empty", "sparse", "score", "constant"];

const GROUP_HEADING = {
  lookahead: "excluded — they tell you the future",
  unit_twin: "the same evidence twice",
  empty: "never populated",
  sparse: "mostly blank",
  score: "scores, not measurements",
  constant: "one value throughout",
};

export function describeColumn(profile) {
  const kind = String(profile?.kind || "");
  const phrase = KIND_PHRASE[kind];
  const flags = Array.isArray(profile?.flags) ? profile.flags : [];
  return {
    column: String(profile?.column || ""),
    kind,
    reads: phrase ? phrase(profile) : "not described",
    blanks: blankSentence(profile),
    warnings: flags.map((flag) => (FLAG_REASON[flag] ? FLAG_REASON[flag](profile) : flag)),
    flags,
  };
}

export function blankSentence(profile) {
  const rows = Number(profile?.rows || 0);
  const blanks = Number(profile?.blanks || 0);
  if (!rows || !blanks) return "none blank";
  if (blanks === rows) return "every row blank";
  return `${blanks.toLocaleString()} rows are blank`;
}

/**
 * One column belongs to one group, by severity. A column that is both sparse and a
 * score appeared twice in the first draft, which reads as two problems.
 */
export function groupColumns(profiles, inUse = []) {
  const used = new Set(inUse);
  const rows = (Array.isArray(profiles) ? profiles : []).map(describeColumn);
  const groups = [];
  const claimed = new Set();
  for (const flag of GROUP_ORDER) {
    const members = rows.filter(
      (row) => !claimed.has(row.column) && row.flags.includes(flag),
    );
    members.forEach((row) => claimed.add(row.column));
    if (members.length) groups.push({ flag, heading: GROUP_HEADING[flag], columns: members });
  }
  return {
    inUse: rows.filter((row) => used.has(row.column)),
    groups,
    clean: rows.filter((row) => !claimed.has(row.column) && !used.has(row.column)),
    total: rows.length,
    resolved: claimed.size,
  };
}

export function surfaceSummary(grouped) {
  const total = Number(grouped?.total || 0);
  const inUse = (grouped?.inUse || []).length;
  const resolved = Number(grouped?.resolved || 0);
  const parts = [`using ${inUse} of ${total} columns`];
  if (resolved) parts.push(`${resolved} resolved without asking you`);
  return parts.join(" · ");
}

/**
 * Proportional bands for the two places a chart beats a sentence.
 *
 * A join is a set intersection, so it gets a Venn — but circles cannot be drawn to
 * proportion in a layout engine without lying about area, so these are linear
 * bands. The bar in the first draft answered one question, how much of the left
 * side is reached, and rendered 7.9%. The bands answer a second for free: 520 of
 * the spine's 570 entities match nothing here, so it is not a narrow version of
 * your universe, it is mostly about other companies.
 *
 * Column groups are the opposite case. Severity puts every column in exactly one
 * group, so overlap would be a lie — days_to_10pct is mostly blank, not both blank
 * and a score. That gets a stacked bar, where the segments are disjoint by
 * construction.
 */

const MIN_VISIBLE = 2;

function widths(values, total, scale) {
  if (!total) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * scale);
  const out = raw.map((width, index) => (values[index] > 0 ? Math.max(MIN_VISIBLE, width) : 0));
  const overflow = out.reduce((sum, width) => sum + width, 0) - scale;
  if (overflow > 0) {
    const largest = out.indexOf(Math.max(...out));
    out[largest] = Math.max(MIN_VISIBLE, out[largest] - overflow);
  }
  return out;
}

/**
 * Three disjoint regions: only-left, both, only-right. Percentages are of the
 * union, so they sum to 100 and can be laid out directly.
 */
export function intersectionBands({ leftTotal, rightTotal, both, leftLabel, rightLabel }) {
  const left = Math.max(Number(leftTotal || 0), 0);
  const right = Math.max(Number(rightTotal || 0), 0);
  const shared = Math.min(Math.max(Number(both || 0), 0), Math.min(left, right));
  const leftOnly = left - shared;
  const rightOnly = right - shared;
  const union = leftOnly + shared + rightOnly;
  const [a, b, c] = widths([leftOnly, shared, rightOnly], union, 100);
  return {
    union,
    bands: [
      { id: "leftOnly", count: leftOnly, percent: a, label: "only here", of: leftLabel },
      { id: "both", count: shared, percent: b, label: "both", of: null },
      { id: "rightOnly", count: rightOnly, percent: c, label: "only there", of: rightLabel },
    ],
    leftReach: left ? Number(((shared / left) * 100).toFixed(3)) : 0,
    rightReach: right ? Number(((shared / right) * 100).toFixed(3)) : 0,
  };
}

export function intersectionCaption(bands) {
  const rightOnly = bands.bands.find((band) => band.id === "rightOnly");
  const both = bands.bands.find((band) => band.id === "both");
  if (!both.count) return "no value in common — this join reaches nothing";
  const parts = [`reaches ${bands.leftReach}% of the left side`];
  if (rightOnly.count) {
    parts.push(`${rightOnly.count.toLocaleString()} on the right match nothing here`);
  }
  return parts.join(" · ");
}

/** Disjoint segments, so a stacked bar rather than an intersection. */
export function groupBands(groups, scale = 100) {
  const rows = (Array.isArray(groups) ? groups : []).filter((group) => Number(group?.count) > 0);
  const total = rows.reduce((sum, group) => sum + Number(group.count), 0);
  const sized = widths(rows.map((group) => Number(group.count)), total, scale);
  return {
    total,
    segments: rows.map((group, index) => ({
      id: String(group.id || group.label || index),
      label: String(group.label || group.id || ""),
      count: Number(group.count),
      percent: sized[index],
    })),
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pct(value, total) {
  if (!total) return 0;
  return Number(((finite(value) / finite(total)) * 100).toFixed(3));
}

export function joinOverlapModel({ leftTotal, rightTotal, shared }) {
  const left = Math.max(finite(leftTotal), 0);
  const right = Math.max(finite(rightTotal), 0);
  const both = Math.min(Math.max(finite(shared), 0), Math.min(left, right));
  const leftOnly = Math.max(left - both, 0);
  const rightOnly = Math.max(right - both, 0);
  const union = leftOnly + both + rightOnly;

  return {
    left,
    right,
    shared: both,
    leftOnly,
    rightOnly,
    union,
    leftReach: pct(both, left),
    rightReach: pct(both, right),
    regions: [
      { id: "leftOnly", count: leftOnly, percent: pct(leftOnly, union) },
      { id: "shared", count: both, percent: pct(both, union) },
      { id: "rightOnly", count: rightOnly, percent: pct(rightOnly, union) },
    ],
  };
}

export function scopeRetentionModel(scope) {
  const rows = Math.max(finite(scope?.rows), 0);
  const limit = Math.max(finite(scope?.limit), 0);
  const recommended = scope?.recommended || null;
  const kept = recommended ? Math.max(finite(recommended.rows), 0) : 0;
  const discarded = recommended ? Math.max(rows - kept, 0) : 0;

  return {
    rows,
    limit,
    recommended,
    kept,
    discarded,
    limitPercent: pct(limit, rows),
    keptPercent: pct(kept, rows),
    discardedPercent: pct(discarded, rows),
    options: (scope?.options || []).map((option) => ({
      id: option.id,
      label: option.label,
      rows: finite(option.rows),
      clears: Boolean(option.clears),
      recommended: Boolean(option.recommended),
      percent: pct(option.rows, rows),
    })),
  };
}

export function unitScaleModel(conflict, outcomes = []) {
  const inputs = [conflict?.left, conflict?.right]
    .filter(Boolean)
    .map((item) => ({
      id: String(item.column || ""),
      label: String(item.column || "column"),
      value: finite(item.typical),
      magnitude: Math.abs(finite(item.typical)),
    }));
  const inputMax = Math.max(...inputs.map((item) => item.magnitude), 0) || 1;

  const results = (Array.isArray(outcomes) ? outcomes : [])
    .filter((item) => Number.isFinite(Number(item?.result)))
    .map((item) => ({
      id: String(item.id || item.label || "result"),
      label: String(item.label || item.id || "Result"),
      value: finite(item.result),
      magnitude: Math.abs(finite(item.result)),
      recommended: Boolean(item.recommended),
    }));
  const resultMax = Math.max(...results.map((item) => item.magnitude), 0) || 1;

  return {
    inputs: inputs.map((item) => ({ ...item, percent: pct(item.magnitude, inputMax) })),
    results: results.map((item) => ({ ...item, percent: pct(item.magnitude, resultMax) })),
  };
}

/**
 * The engine refuses more than a million rows in one step, and the largest
 * joinable dataset on the desk is 1,043,042. So the refusal is not an edge case,
 * it is the first thing a researcher meets — and it has to be met before any
 * method decision, because a decision made against a construction that cannot run
 * is a wasted decision.
 *
 * The recommendation is the smallest cut that clears. A first draft suggested
 * 2023 and threw away half the panel when 2020 clears it at −7.1%.
 */

export function scopeOptions(block) {
  const rows = Number(block?.rows || 0);
  const limit = Number(block?.limit || 0);
  const options = (Array.isArray(block?.options) ? block.options : []).map((option) => {
    const kept = Number(option?.rows || 0);
    return {
      id: String(option?.id || option?.from || ""),
      label: String(option?.label || (option?.from ? `from ${option.from}` : "")),
      rows: kept,
      clears: Boolean(limit) && kept <= limit,
      discarded: rows ? Number((((rows - kept) / rows) * 100).toFixed(1)) : 0,
      note: String(option?.note || ""),
    };
  });
  const clearing = options.filter((option) => option.clears);
  const recommended = clearing.length
    ? clearing.reduce((best, option) => (option.rows > best.rows ? option : best))
    : null;
  return {
    rows,
    limit,
    over: Math.max(rows - limit, 0),
    overPct: limit ? Number((((rows - limit) / limit) * 100).toFixed(1)) : 0,
    options: options.map((option) => ({ ...option, recommended: option.id === recommended?.id })),
    recommended,
    blocked: Boolean(limit) && rows > limit,
  };
}

/**
 * Some refusals cannot be scoped away. A key that multiplies every row by 198
 * still multiplies after any date cut, and offering a smaller slice sends the
 * researcher down a road with no end — the shape is wrong, not the size.
 */
export function scopeCanHelp(scope) {
  return Boolean(scope?.options?.some((option) => option.clears));
}

export function scopeHeadline(scope) {
  if (!scope?.blocked) return "";
  if (!scopeCanHelp(scope)) {
    return "no cut clears this — the join shape is the problem, not the row count";
  }
  return `${scope.rows.toLocaleString()} rows · the engine stops at ${scope.limit.toLocaleString()}`;
}

/**
 * The block is a length, not a subtraction. A bar with the limit marked shows how
 * far over the input is, and where each cut would land, without the reader doing
 * arithmetic across four list rows.
 */
export function limitBar(scope, width = 40) {
  const rows = Number(scope?.rows || 0);
  const limit = Number(scope?.limit || 0);
  if (!rows || !limit) return null;
  const span = Math.max(rows, limit);
  const cells = (value) => Math.max(0, Math.min(width, Math.round((value / span) * width)));
  return {
    width,
    inputCells: cells(rows),
    limitCells: cells(limit),
    marks: (scope.options || [])
      .filter((option) => option.clears)
      .map((option) => ({ id: option.id, label: option.label, cells: cells(option.rows) })),
  };
}

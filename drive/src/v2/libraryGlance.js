const MIN_BAR = 2;
const AXIS_FLOOR = 1900;

function yearOf(text) {
  const match = /^\s*(\d{4})/.exec(String(text || ""));
  return match ? Number(match[1]) : null;
}

export function rowsLabel(count) {
  if (count === null || count === undefined || count === "") return "";
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B rows`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M rows`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K rows`;
  return `${n.toLocaleString("en-US")} ${n === 1 ? "row" : "rows"}`;
}

export function spanOf(row) {
  const glance = row?.glance || {};
  const coverage = typeof row?.coverage === "string" ? /(\d{4}[-\d]*)\s*(?:→|->|–|—|to)\s*(\d{4}[-\d]*)/.exec(row.coverage) : null;
  const from = glance.from || coverage?.[1] || "";
  const to = glance.to || coverage?.[2] || "";
  const rawRows = glance.rows ?? row?.row_count;
  const rows = rawRows === null || rawRows === undefined || rawRows === "" ? NaN : Number(rawRows);
  const fromYear = yearOf(from);
  const toYear = yearOf(to);
  return {
    rows: Number.isFinite(rows) && rows >= 0 ? rows : null,
    columns: Number(glance.columns) || null,
    from,
    to,
    fromYear,
    toYear,
    ranged: fromYear !== null && toYear !== null && toYear >= fromYear,
  };
}

export function spanAxis(spans, thisYear = new Date().getFullYear()) {
  const ranged = spans.filter((span) => span.ranged);
  if (!ranged.length) return null;
  const earliest = Math.min(...ranged.map((span) => span.fromYear));
  const max = Math.max(thisYear, ...ranged.map((span) => span.toYear));
  const min = earliest < AXIS_FLOOR && max > AXIS_FLOOR ? AXIS_FLOOR : earliest;
  return { min, max: max === min ? min + 1 : max };
}

export function barBox(span, axis) {
  if (!span?.ranged || !axis) return null;
  const total = axis.max - axis.min;
  const from = Math.max(span.fromYear, axis.min);
  const left = ((from - axis.min) / total) * 100;
  const width = Math.max(MIN_BAR, ((Math.max(span.toYear, from) - from) / total) * 100);
  return { left: Math.min(left, 100 - MIN_BAR), width: Math.min(width, 100 - Math.min(left, 100 - MIN_BAR)) };
}

export function spanText(span) {
  if (!span?.ranged) return "";
  return span.fromYear === span.toYear ? String(span.fromYear) : `${span.fromYear}–${span.toYear}`;
}

export function glanceTitle(span) {
  const parts = [];
  if (span?.rows !== null && span?.rows !== undefined) parts.push(`${span.rows.toLocaleString("en-US")} rows`);
  if (span?.columns) parts.push(`${span.columns} columns`);
  if (span?.ranged) parts.push(`${span.from} to ${span.to}`);
  return parts.join(" · ");
}

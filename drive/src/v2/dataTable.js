export const DATA_TABLE_PAGE_SIZE = 100;
export const DATA_TABLE_ROW_LIMIT = 5000;

export function tableColumns(rows) {
  const seen = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) seen.add(key);
  }
  return [...seen];
}

function comparable(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  const numeric = Number(text.replace(/,/g, ""));
  return text !== "" && Number.isFinite(numeric) ? numeric : text.toLowerCase();
}

export function sortRows(rows, column, direction = "asc") {
  if (!column) return rows;
  const sign = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = comparable(a?.[column]);
    const right = comparable(b?.[column]);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return String(left).localeCompare(String(right)) * sign;
  });
}

export function filterRows(rows, text, columns) {
  const needle = String(text || "").trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => columns.some((column) => String(row?.[column] ?? "").toLowerCase().includes(needle)));
}

export function pageOf(rows, page, size = DATA_TABLE_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const start = current * size;
  return { rows: rows.slice(start, start + size), page: current, pages, first: rows.length ? start + 1 : 0, last: Math.min(start + size, rows.length) };
}

export function numericColumns(rows, columns) {
  return new Set(columns.filter((column) => {
    let seen = 0;
    for (const row of rows || []) {
      const value = row?.[column];
      if (value === null || value === undefined || value === "") continue;
      if (typeof comparable(value) !== "number") return false;
      seen += 1;
    }
    return seen > 0;
  }));
}

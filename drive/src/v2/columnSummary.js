const short = (value) => {
  const text = String(value ?? "");
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
};

const number = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  if (Number.isInteger(n) && Math.abs(n) >= 1000 && Math.abs(n) < 3000) return String(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 1 : 3 });
};

const day = (value) => String(value ?? "").slice(0, 10);

export function columnSummary(column) {
  if (!column || typeof column !== "object") return "";
  const total = (Number(column.filled) || 0) + (Number(column.empty) || 0);
  const emptyShare = total && column.empty ? Math.round((column.empty / total) * 100) : 0;
  const emptyNote = emptyShare >= 1 ? ` · ${emptyShare}% empty` : column.empty ? " · some empty" : "";
  if (column.kind === "empty") return "All empty";
  if (column.kind === "number") {
    const span = column.min === column.max ? number(column.min) : `${number(column.min)} – ${number(column.max)}`;
    return `${span}${emptyNote}`;
  }
  if (column.kind === "date") {
    const span = column.min === column.max ? day(column.min) : `${day(column.min)} → ${day(column.max)}`;
    return `${span}${emptyNote}`;
  }
  const top = Array.isArray(column.top) ? column.top : [];
  if (column.distinct === 1 && top[0]) return `One value: ${short(top[0].value)}${emptyNote}`;
  const distinct = Number(column.distinct) || 0;
  return `${distinct.toLocaleString("en-US")} value${distinct === 1 ? "" : "s"}${emptyNote}`;
}

export function columnBars(column) {
  const counts = Array.isArray(column?.bins)
    ? column.bins
    : column?.categorical && Array.isArray(column.top) ? column.top.map((item) => item?.count) : [];
  const bins = counts.map((n) => Number(n) || 0);
  const peak = Math.max(0, ...bins);
  if (bins.length < 2 || !peak) return [];
  return bins.map((n) => n / peak);
}

export function columnSummaryTitle(column) {
  if (!column || typeof column !== "object") return "";
  const parts = [`${column.name}: ${column.kind}`];
  if (column.filled != null) parts.push(`${Number(column.filled).toLocaleString("en-US")} filled`);
  if (column.empty) parts.push(`${Number(column.empty).toLocaleString("en-US")} empty`);
  if (Array.isArray(column.top) && column.top.length) {
    parts.push(`most common: ${column.top.map((t) => `${t.value} (${t.count})`).join(", ")}`);
  }
  return parts.join(" · ");
}

export function profileBasis(profile) {
  if (!profile || typeof profile !== "object") return "";
  const profiled = Number(profile.rows_profiled) || 0;
  const total = Number(profile.rows_total) || profiled;
  if (!profiled) return "";
  if (profile.complete || profiled >= total) {
    return `Column summaries cover all ${total.toLocaleString("en-US")} row${total === 1 ? "" : "s"}.`;
  }
  return `Column summaries cover the first ${profiled.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} rows.`;
}

export function sampleReceipt(shown, columns, total) {
  const n = Number(shown) || 0;
  const all = Number(total) || 0;
  const cols = `${columns} column${columns === 1 ? "" : "s"}`;
  if (all > n) return `Sample of ${n} from ${all.toLocaleString("en-US")} rows · ${cols}`;
  return `${n} row${n === 1 ? "" : "s"} · ${cols}`;
}

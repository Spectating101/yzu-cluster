const ID_LIKE = /(^|_)(id|uuid|hash|url|uri|file|path|run|record)(_|$)/i;
const MAX_COLUMNS = 4;
const MAX_TEXT = 28;

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatGlanceCell(value) {
  if (value == null || value === "") return { text: "—", numeric: false };
  const n = numeric(value);
  if (n != null) {
    const abs = Math.abs(n);
    const text = Number.isInteger(n) && abs < 1e15
      ? n.toLocaleString("en-US", { useGrouping: abs >= 10000 })
      : abs >= 1e9 || (abs > 0 && abs < 0.001)
        ? n.toExponential(2)
        : n.toLocaleString("en-US", { maximumFractionDigits: abs >= 100 ? 1 : 3 });
    return { text, numeric: true };
  }
  const text = typeof value === "object" ? "…" : String(value).replace(/\s+/g, " ").trim();
  return { text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text, numeric: false };
}

export function glanceColumns(rows, dataset = {}) {
  const sample = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
  if (!sample.length) return [];
  const present = Object.keys(sample[0]);
  const wanted = [
    dataset.time_field,
    ...(Array.isArray(dataset.entity_fields) ? dataset.entity_fields : []),
  ].filter((key) => key && present.includes(key));
  const usable = present.filter((key) => {
    if (wanted.includes(key)) return false;
    if (ID_LIKE.test(key)) return false;
    return sample.some((row) => row[key] != null && row[key] !== "")
      && sample.every((row) => String(row[key] ?? "").length <= 64);
  });
  const measures = usable.filter((key) => sample.every((row) => row[key] == null || row[key] === "" || numeric(row[key]) != null));
  const labels = usable.filter((key) => !measures.includes(key) && sample.every((row) => String(row[key] ?? "").length <= 20));
  const lead = [...wanted, ...measures].slice(0, MAX_COLUMNS);
  return lead.length >= 3 ? lead : [...new Set([...lead, ...labels])].slice(0, MAX_COLUMNS);
}

export function glanceHeader(key) {
  return String(key).replace(/_iso[23]$/i, "").replace(/_/g, " ").trim();
}

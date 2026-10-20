function spanOf(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return "";
  const window = value.requested || value.date_range || value;
  const bounds = [window.start, window.end].map((bound) => String(bound || "").slice(0, 10)).filter(Boolean);
  return bounds.join(" → ");
}

export function coverageSpan(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(coverageSpan).filter(Boolean).join(" · ");
  return spanOf(value);
}

export function coverageText(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(coverageText).filter(Boolean).join(" · ");
  const span = spanOf(value);
  const counts = Number.isFinite(value.usable_cells) && Number.isFinite(value.requested_cells)
    ? `${value.usable_cells}/${value.requested_cells} usable observations` : "";
  return [span, value.status, counts].filter(Boolean).join(" · ") || JSON.stringify(value);
}

export function coverageText(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(coverageText).filter(Boolean).join(" · ");
  const request = value.requested || {};
  const span = [request.start, request.end].filter(Boolean).join(" → ");
  const counts = Number.isFinite(value.usable_cells) && Number.isFinite(value.requested_cells)
    ? `${value.usable_cells}/${value.requested_cells} usable observations` : "";
  return [span, value.status, counts].filter(Boolean).join(" · ") || JSON.stringify(value);
}

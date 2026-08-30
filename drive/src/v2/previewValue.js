const DEFAULT_PREVIEW_LIMIT = 220;

function compactJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function isStructuredPreviewValue(value) {
  return value !== null && typeof value === "object";
}

export function fullPreviewValue(value) {
  if (value == null) return "—";
  if (!isStructuredPreviewValue(value)) return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Structured value";
  }
}

export function formatPreviewValue(value, limit = DEFAULT_PREVIEW_LIMIT) {
  if (value == null) return "—";
  let text;
  if (isStructuredPreviewValue(value)) {
    text = compactJson(value) || "Structured value";
  } else {
    text = String(value);
  }
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1))}…`;
}

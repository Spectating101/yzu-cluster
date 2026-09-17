const INTERNAL_PATH_PREFIXES = [
  "/home/",
  "/media/",
  "/mnt/",
  "/opt/",
  "/run/media/",
  "/srv/",
  "/tmp/",
  "/var/lib/",
];

function basename(value) {
  const parts = String(value || "").split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || "[internal path hidden]";
}

export function previewCellValue(value, { empty = "—", maxLength = 240 } = {}) {
  if (value == null || value === "") return empty;

  let text;
  if (typeof value === "string") {
    const stripped = value.trim();
    const pathValue = stripped.startsWith("file://") ? stripped.slice(7) : stripped;
    text = INTERNAL_PATH_PREFIXES.some((prefix) => pathValue.startsWith(prefix))
      ? basename(pathValue)
      : value;
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "[structured value]";
    }
  } else {
    text = String(value);
  }

  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function researcherPreviewReason(value, fallback = "The bounded preview could not establish schema or sample rows.") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/\bsubmit_collection\b|desk role .* lacks permission/i.test(raw)) {
    return "Collection requests require a research-member account. This preview has not started collection.";
  }
  if (/name resolution|enotfound|eai_again|getaddrinfo|\bdns\b/i.test(raw)) {
    return "The source hostname could not be resolved, so the preview remains unverified.";
  }
  if (/timed?\s*out|timeout|deadline exceeded/i.test(raw)) {
    return "The source did not respond before the preview timed out, so no rows are claimed.";
  }
  if (/traceback|\bexception\b|\berrno\b|econnrefused|connection error/i.test(raw)) {
    return fallback;
  }
  return raw;
}

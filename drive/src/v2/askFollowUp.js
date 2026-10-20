export const FOLLOW_UP_INTERVAL_MS = 4000;
export const FOLLOW_UP_LIMIT_MS = 120000;

export function awaitsFullAnswer(out) {
  const artifacts = out?.artifacts || {};
  return out?.action === "fast_lookup" || artifacts.action === "fast_lookup" || artifacts.full_answer_pending === true;
}

const rowText = (row) => String(row?.content || row?.text || "").trim();

export function lateAssistantRows(rows, quickReply) {
  if (!Array.isArray(rows)) return [];
  const anchor = String(quickReply || "").trim();
  let index = -1;
  rows.forEach((row, i) => {
    if (row?.role === "assistant" && rowText(row) === anchor) index = i;
  });
  if (index < 0) return [];
  return rows.slice(index + 1).filter((row) => row?.role === "assistant" && rowText(row));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parsed(value) {
  const text = String(value || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: match[1], month } : null;
}

export function addedOn(row = {}) {
  const date = parsed(row.retrieved_at) || parsed(row.procurement?.promoted_at) || parsed(row.collection?.wired_at);
  return date ? `Added ${MONTHS[date.month - 1]} ${date.year}` : "";
}

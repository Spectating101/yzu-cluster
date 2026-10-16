const OPENING = /^(?:this|the)\s+(?:dataset|data\s?set|table|file|panel|record|snapshot)\s+(?:is\s+(?:a|an|the)\s+|contains\s+|provides\s+|tracks\s+|links\s+|lists\s+|records\s+|covers\s+|captures\s+|gives\s+|shows\s+)/i;

export function listDescription(text) {
  const raw = String(text || "").trim();
  const match = raw.match(OPENING);
  if (!match) return raw;
  const verb = match[0].trim().split(/\s+/)[2]?.toLowerCase() || "";
  const rest = raw.slice(match[0].length);
  if (!rest) return raw;
  const lead = verb === "is" ? rest : `${verb} ${rest}`;
  return lead.charAt(0).toUpperCase() + lead.slice(1);
}

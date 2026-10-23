const CUES = [
  /\b(hourly|daily|weekly|monthly|quarterly|annual|yearly)\b/i,
  /\b(by|per) (country|state|county|city|region|firm|company|industry|sector|year|quarter|month|week|day)\b/i,
  /\b(country|state|county|firm|company|industry|sector|household|individual)-level\b/i,
  /\b(across|between)\b/i,
  /\b(since \d{4}|from \d{4}|\d{4}\s*(?:-|–|to)\s*\d{4})\b/i,
  /\b(panel|time series)\b/i,
];

export function hasNeedShape(query) {
  const text = String(query || "").trim();
  if (text.split(/\s+/).length < 3) return false;
  return CUES.filter((cue) => cue.test(text)).length >= 2;
}

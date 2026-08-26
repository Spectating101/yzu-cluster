function text(value) {
  return String(value || "").trim();
}

const GRAIN_RE = /\b(?:grain|unit|panel|daily|weekly|monthly|quarterly|annual(?:ly)?|per\s+(?:asset|issuer|firm|country|event|transaction|user|document)|(?:asset|issuer|firm|country|event|transaction|token|exchange)\s*(?:[×x]|-|by)\s*(?:day|week|month|quarter|year))\b/i;
const PERIOD_RE = /\b(?:19|20)\d{2}\b|\b(?:since|from|between|through|until|before|after|historical|longitudinal|over\s+time|time\s+horizon|period|window)\b/i;
const USE_RE = /\b(?:test(?:ing)?|estimate|regression|event[- ]study|forecast|predict|validate|validation|compare|explain|causal|monitor|screen|rank|downstream|reuse|reusable|input\s+for|support\s+(?:a|an|the)?\s*(?:study|analysis|model))\b/i;

export function synthesisDraftBrief(objective = "") {
  const value = text(objective);
  const words = value ? value.split(/\s+/).filter(Boolean) : [];
  const cues = [
    {
      id: "object",
      label: "Research object",
      ready: words.length >= 6,
      help: "What should exist or be measured?",
      example: "weekly trust-deterioration measure",
    },
    {
      id: "grain",
      label: "Unit / grain",
      ready: GRAIN_RE.test(value),
      help: "What does one row or observation represent?",
      example: "asset × week",
    },
    {
      id: "period",
      label: "Time horizon",
      ready: PERIOD_RE.test(value),
      help: "What period or window matters?",
      example: "2021–2026",
    },
    {
      id: "use",
      label: "Intended use",
      ready: USE_RE.test(value),
      help: "What research decision will this support?",
      example: "input to an event study",
    },
  ];
  const complete = cues.filter((cue) => cue.ready).length;
  const missing = cues.filter((cue) => !cue.ready);
  return {
    objective: value,
    wordCount: words.length,
    cues,
    complete,
    missing,
    readyToCreate: Boolean(value) && complete >= 3,
  };
}

export function synthesisDraftPrompt(objective = "") {
  const brief = synthesisDraftBrief(objective);
  const missing = brief.missing.map((cue) => cue.label).join(", ");
  if (!brief.objective) {
    return "Help me frame a new Synthesis research object. Ask one high-value clarification at a time. Help me state the research object, unit or grain, time horizon, and intended use. Do not choose evidence or methodology yet.";
  }
  return `Help me sharpen this unsaved Synthesis research brief without choosing evidence or methodology yet. Draft purpose: ${brief.objective}. ${missing ? `The framing checklist still does not clearly state: ${missing}.` : "The four framing commitments are all mentioned."} Ask the single highest-value clarification first, then propose a concise improved research-purpose sentence.`;
}

const STATES = {
  supported: { mark: "✓", tone: "held", word: "recorded", note: "recorded for a held dataset" },
  conflicting: { mark: "~", tone: "partial", word: "conflicting", note: "held records disagree" },
  unverified: { mark: "?", tone: "unverified", word: "unverified", note: "recorded, not verified" },
  unknown: { mark: "?", tone: "unverified", word: "unverified", note: "nothing recorded" },
  not_supported: { mark: "✗", tone: "missing", word: "not recorded", note: "no held dataset records it" },
};

export function needRows(assessment, dimensions = []) {
  const status = assessment?.assessment_basis?.dimension_status;
  if (!status || typeof status !== "object") return [];
  const rows = dimensions
    .filter((item) => item.value && item.value !== "Unknown" && Object.hasOwn(status, item.key))
    .map((item) => {
      const state = STATES[status[item.key]] ? status[item.key] : "unknown";
      return { key: item.key, label: item.label, value: item.value, state, ...STATES[state] };
    });
  const seen = new Set();
  return rows
    .reverse()
    .filter((row) => {
      const key = String(row.value).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
}

export function needSummary(rows = []) {
  const order = ["recorded", "conflicting", "not recorded", "unverified"];
  return order
    .map((word) => [rows.filter((row) => row.word === word).length, word])
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`)
    .join(" · ");
}

export function needBasis(assessment) {
  const modelVerdict = String(assessment?.verdict_basis || "") === "model_judgement";
  return modelVerdict
    ? "Marks show what the Library's catalogue records for each held dataset. The verdict is the assistant's reading of their descriptions, so the two can differ."
    : "Marks show what the Library's catalogue records for each held dataset.";
}

const OMITTED = new Set(["start", "end", "series_ids", "indicator_ids", "instruments", "parts"]);
const PROVIDERS = { fred_observations: "FRED", world_bank_indicators: "World Bank" };

function valueText(value) {
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "Not specified");
}

function requestFacts(request, prefix = "") {
  return [
    { label: `${prefix}Period`, value: `${request.start || "Not specified"} → ${request.end || "Not specified"}` },
    { label: `${prefix}Series`, value: valueText(request.series_ids || request.indicator_ids || request.instruments || ["See collection details"]) },
    ...Object.entries(request).filter(([key]) => !OMITTED.has(key)).map(([key, value]) => ({
      label: prefix + key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
      value: valueText(value),
    })),
  ];
}

export function jobReviewFacts(request = {}) {
  if (!Array.isArray(request.parts)) return requestFacts(request);
  return [
    ...request.parts.flatMap((part, index) => {
      const prefix = `Part ${index + 1} · `;
      return [
        { label: prefix + "Source", value: PROVIDERS[part.source_id] || part.source_id || "Not recorded" },
        ...requestFacts(part.request || {}, prefix),
      ];
    }),
    ...Object.entries(request).filter(([key]) => !OMITTED.has(key)).map(([key, value]) => ({
      label: key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
      value: valueText(value),
    })),
  ];
}

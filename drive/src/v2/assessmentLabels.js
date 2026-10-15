const VERDICT_LABELS = {
  covered: "Covered",
  partially_covered: "Partially covered",
  partial: "Partially covered",
  not_covered: "Not covered",
  uncovered: "Not covered",
  cannot_assess: "Not yet recorded",
};
const ASSESSMENT_STATUS_LABELS = {
  insufficient_metadata: "Not yet recorded",
  insufficient_requirement: "Needs a brief",
};

const key = (value) => String(value || "").trim().toLowerCase().replace(/[ -]/g, "_");

export function assessmentStatusKey(result) {
  return key(result?.assessment_status);
}

const JUDGED_VERDICT_LABELS = {
  covered: "Likely covered",
  partially_covered: "Likely partly covered",
  not_covered: "Likely not covered",
};

export function assessmentLabel(result, fallback = "Coverage assessment") {
  if (key(result?.verdict_basis) === "model_judgement" && JUDGED_VERDICT_LABELS[key(result?.verdict)]) {
    return JUDGED_VERDICT_LABELS[key(result?.verdict)];
  }
  return ASSESSMENT_STATUS_LABELS[key(result?.assessment_status)] || VERDICT_LABELS[key(result?.verdict)] || fallback;
}

export function judgedLibraryMatch(result) {
  const held = Array.isArray(result?.held_evidence) ? result.held_evidence : [];
  return held.find((row) => row?.judgement === "covers") || held.find((row) => row?.judgement === "partial") || null;
}

export function librarySupportSummary(result) {
  const held = Array.isArray(result?.held_evidence) ? result.held_evidence : [];
  const covers = held.filter((row) => row?.judgement === "covers").length;
  const partial = held.filter((row) => row?.judgement === "partial").length;
  const checked = held.length;
  if (covers) return { value: `${covers} cover${covers === 1 ? "s" : ""}`, detail: `of ${checked} Library record${checked === 1 ? "" : "s"} checked` };
  if (partial) return { value: `${partial} partly cover${partial === 1 ? "s" : ""}`, detail: `of ${checked} Library record${checked === 1 ? "" : "s"} checked` };
  return { value: String(checked), detail: `Library record${checked === 1 ? "" : "s"} checked` };
}

export function assessmentGapText(result) {
  if (key(result?.assessment_status) === "insufficient_requirement") {
    return "State what the data must cover (period, frequency, or instruments) so coverage in your Library can be checked.";
  }
  return String(result?.gap?.statement || "").trim();
}

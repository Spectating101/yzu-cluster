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

export function assessmentLabel(result, fallback = "Coverage assessment") {
  return ASSESSMENT_STATUS_LABELS[key(result?.assessment_status)] || VERDICT_LABELS[key(result?.verdict)] || fallback;
}

export function assessmentGapText(result) {
  if (key(result?.assessment_status) === "insufficient_requirement") {
    return "State what the data must cover (period, frequency, or instruments) so held coverage can be checked.";
  }
  return String(result?.gap?.statement || "").trim();
}

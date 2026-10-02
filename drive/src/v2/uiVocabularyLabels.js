// Display-only labels for known generated wording. Never use this helper to
// construct a request, saved proposal, identifier, or researcher-authored input.
const DISPLAY_LABELS = {
  "Query-ready": "Ready to query",
  "Registered": "Saved to Library",
  "Registered · unconfirmed": "In Library · not yet checked",
  "Registered · reconciliation pending": "In Library · being checked",
  "Validating bounded Preview receipt": "Checking the sample preview record",
  "Is a retry sufficient, or does this failure require a method revision?": "Is a retry sufficient, or does this failure require a new version of the method?",
  "Which assumption changes if I accept this revision?": "Which assumption changes if I accept this version?",
  "Preview this revision before building it.": "Preview this version before building it.",
  "Ground this research brief in the recorded Library evidence and create one reviewable Synthesis proposal. State its evidence roles, target grain, direct-measure limitation, and the one unresolved choice that matters most. Record the proposal for review; do not accept it, collect evidence, execute work, or alter data.": "Use recorded data in Library to suggest one Synthesis build for review. Explain the data roles, unit of observation, measurement limitations, and the most important unresolved choice. Save the proposal for review without starting work or changing data.",

  "Help me frame a new Synthesis research object. Ask one high-value clarification at a time. Help me state the research object, unit or grain, time horizon, and intended use. Do not choose evidence or methodology yet.": "Help me frame a research question, unit of observation, time horizon, and intended use before choosing data or a method.",
  "Explain the current desk setup.": "Explain the current Research Drive setup.",
  "Which held assets overlap?": "Which datasets in my Library overlap?",
  "Explain the current construction.": "Explain the current build.",
  "What query-ready datasets do we already hold for my research?": "Which datasets in my Library are ready to query for my research?",
  "What grain and time horizon should I state before creating this construction?": "What unit of observation and time horizon should I state before creating this build?",
  "Why is this construction preferred over the alternatives?": "Why is this build suggested over the alternatives?",
  "What would falsify this proposed proxy construction?": "What would falsify this proposed proxy build?",
  "What is the next material method decision in this construction?": "What is the next important method decision in this build?",
  "Which part of the accepted recipe caused the bounded run to fail?": "Which part of the accepted recipe caused the sample test to fail?",
  "What does this bounded Preview fail to cover?": "What does this sample preview fail to cover?",
  "What exactly will bounded Preview test for this method?": "What exactly will the sample preview test for this method?",
  "Which method and input revisions are bound to this approval request?": "Which versions of the method and inputs does this approval request cover?",
  "Is a retry sufficient, or should I revise the construction first?": "Is a retry sufficient, or should I revise the build first?",
  "Which durable execution evidence tells us where this failed?": "Which saved execution evidence tells us where this failed?",
  "What proof is still missing before this worker output becomes a Library asset?": "What checks are still missing before this output is saved to Library?",
  "Explain the difference between worker completion and registration here.": "Explain the difference between completing the work and saving the output to Library here.",
  "Is there any indication registration is blocked?": "Is there any indication saving to Library is blocked?",
  "What remains unverified until registration completes?": "What remains unchecked until saving to Library completes?",
  "Audit this asset's provenance and construction limitations.": "Review this dataset’s source history and build limitations.",
  "How should I use this query-ready asset defensibly?": "How should I use this dataset that is ready to query?",
  "Audit this registered asset's provenance.": "Review this saved dataset’s source history.",
  "What remains before this asset is query-ready?": "What remains before this dataset is ready to query?",
  "How could another construction reuse this result without overstating readiness?": "How could another build reuse this result without overstating readiness?",
  "Explain the current construction and its authority state.": "Explain the current build and how its status was verified.",
  "Compare the alternative constructions and say what each one costs.": "Compare the alternative builds and say what each one costs.",
  "Accept the recommended construction and draft the detailed method.": "Accept the suggested build and draft the detailed method.",
  "I want to revise this research intent. Show the change that would be recorded before applying it.": "I want to revise this research request. Show the change that would be saved before applying it.",
  "Trace the evidence and authority behind the current Synthesis decision.": "Show the evidence and checks behind the current Synthesis decision.",
  "What changed in the durable Synthesis state most recently?": "What changed in the saved Synthesis build most recently?",
  "Review pending procurement approvals on this desk.": "Review pending collection approvals in Research Drive.",
  "Acquisition or registration work is still pending.": "Collection or saving to Library is still pending.",
  "Collection finished, but registration is still pending.": "Collection finished, but saving to Library is still pending.",
  "Registration not complete": "Saving to Library is not complete",
  "Connector route declared; collection remains approval-gated.": "Download method known; collection still requires your approval.",
  "Review held evidence": "Review data in your Library",
  "Review held evidence and route genuine gaps": "Review data in your Library and find what is missing",
  "Library confirms what is actually held": "Library confirms what data you have",
  "Methods, execution, archive, registration, and readiness are separate records": "Methods, execution, archiving, saving to Library, and readiness are checked separately",
  "Library holds saved data": "Library stores your saved data",
  "Synthesis holds saved builds": "Synthesis stores your saved builds",
  "Use what your Library already holds before collecting again.": "Use data you already have in Library before collecting again.",
  "Held Library inputs": "Inputs from your Library",
  "No held Library evidence matched this research object": "No data in your Library matched this research object",
  "Method construction": "Method design",
  "Bounded Preview": "Sample preview",
  "Registered result": "Result saved to Library",
  "Query-ready result": "Result ready to query",
  "Recorded event": "Last step",
  "Collection route": "Collection method",
  "Desk setup": "Research Drive setup",
  "New construction": "New build"
};

const GENERATED_LABELS = [
  [/^Add URL or DOI to (.+)\. Targets: (.+)\. Probe source, collect metadata, and procure if missing\.$/u, "Add URL or DOI to $1. Sources: $2. Test the connection, collect metadata, and request missing data."],
  [/^Procure datasets for (.+)\. Search faculty sources, check the local catalog, probe public sources, and propose acquisition steps\.$/u, "Find datasets for $1. Search faculty sources, check Library, test public source connections, and suggest collection steps."],
  [/^Explain this Library branch: (.+)\. Summarize holdings, query readiness, missing material, and the next acquisition action\.$/u, "Explain this Library folder: $1. Summarize data I have, readiness to query, missing data, and the next collection step."],
  [/^Help me reason through this Synthesis thread: (.+)\. Distinguish the recorded intent, recommendation, assumptions, and the next decision\. Do not claim a method has been accepted or built unless the thread proves it\.$/u, "Help me reason through this Synthesis build: $1. Distinguish the saved request, suggestion, assumptions, and next decision. Only describe a method as accepted or built when the saved record confirms it."],
  [/^Help me sharpen this unsaved Synthesis research brief without choosing evidence or methodology yet\. Draft purpose: (.+)$/su, "Help me sharpen this research question before saving it."],
  [/^Compare (.+) with my Library holdings$/u, "Compare $1 with data in my Library"],
  [/^What should I probe next for (.+)\?$/u, "Which connection should I test next for $1?"],
  [/^Inspect (.+) in this construction\.(.*)$/u, "Inspect $1 in this build.$2"],
  [/^Scope this construction (.+)\. Say what that removes from my question\.$/u, "Scope this build $1. Say what that removes from my question."],
  [/^For the revision, change (.+)\.$/u, "For this version, change $1."],
  [/^What was or will be registered from collecting (.+)\?$/u, "What was or will be saved to Library from collecting $1?"],
  [/^Can I use the output of (.+) yet\? Distinguish registered vs query-ready honestly\.$/u, "Can I use the output of $1 yet? Distinguish saving to Library from readiness to query."],
  [/^Given (.+), what should I probe next, and what would still remain unknown after a successful probe\?$/u, "Given $1, which connection should I test next, and what would remain unknown after a successful test?"],
  [/^Why is the local dataset only partial for (.+)\? Use the documented coverage\/grain differences only\.$/u, "Why does the local dataset only partly cover $1? Use documented coverage and unit of observation differences only."],
  [/^What coverage would acquiring (.+) add beyond the local asset\? Do not invent dimensions\.$/u, "What coverage would collecting $1 add beyond the local dataset? Do not invent dimensions."],
  [/^How is the local asset related to (.+)\? Do not claim equivalence\.$/u, "How is the local dataset related to $1? Do not claim equivalence."],
  [/^Can I answer my research question with the local asset already matched to (.+)\?$/u, "Can I answer my research question with the local dataset already matched to $1?"],
  [/^What did the completed local comparison check for (.+), and why was no qualifying Library asset found\?$/u, "What did the completed local comparison check for $1, and why was no qualifying Library dataset found?"],
  [/^Review the declared connector route for (.+)\.$/u, "Review the documented download method for $1."],
  [/^Connector route for (.+)\.$/u, "Download method for $1."],
  [/^Acquisition is (.+); History holds the saved request record\.$/u, "Collection is $1; view the saved request in History."],
  [/^Challenge this unsaved research-object framing before it becomes durable: (.+)\. Identify the single most consequential ambiguity in construct, unit, period, or intended use\. Do not choose evidence or methodology\.$/u, "Challenge this research question before saving it: $1. Identify the most important ambiguity in construct, unit, period, or intended use. Do not choose evidence or methodology."],
];

export function uiVocabularyLabel(value) {
  if (typeof value !== "string") return value;
  if (Object.hasOwn(DISPLAY_LABELS, value)) return DISPLAY_LABELS[value];
  for (const [pattern, label] of GENERATED_LABELS) {
    if (pattern.test(value)) return value.replace(pattern, label);
  }
  return value;
}

// Only blueprint objectives carry this generated line. The stored objective
// and request context keep their original wording.
export function synthesisObjectiveDisplay(value) {
  if (typeof value !== "string" || !value.startsWith("Blueprint: ")) return value;
  return value.replace(/^Registered inputs: /gm, "Inputs from Library: ");
}

import { useEffect, useRef } from "react";
import { canIUseDecision, libraryAssetPresentation, statusPillKind } from "@/v2/datasetMeta";
import { DISCOVER_TAB } from "@/v2/tabIdentity";
import { plainIdentifiers } from "@/v2/plainText";
import { synthesisJourneyStage } from "@/v2/synthesisLifecycle";
import { assessmentGapText, assessmentLabel } from "./assessmentLabels.js";

function text(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(" · ");
  if (typeof value === "object") return "";
  return String(value).trim();
}

function humanize(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function sourceLabel(row = {}) {
  return text(
    row.source ||
      row.publisher ||
      row.source_system ||
      row.source_route ||
      row.collect_via ||
      row.backend,
  );
}

function surfaceLabel(mainTab) {
  if (mainTab === DISCOVER_TAB) return "Discover";
  if (mainTab === "library") return "Library";
  if (mainTab === "synthesis") return "Synthesis";
  if (mainTab === "resources") return "Resources";
  if (mainTab === "profile") return "Profile";
  if (mainTab === "settings") return "Research Drive setup";
  return "Research Drive";
}

function synthesisPhaseLabel(thread) {
  const stage = synthesisJourneyStage(thread);
  // "Method" is the researcher-facing name for Specification. Every later
  // state keeps its own journey identity: Proposal, Readiness, Approval,
  // Build, and Result are not interchangeable flavours of "Review".
  if (stage === "specification") return "Method";
  return humanize(stage);
}

function discoverSituation({ browseTarget, browseLifecycle, historyEvent, discoverIntentRecord, discoverAssessment, restingSummary, discoverMode }) {
  if (discoverIntentRecord) {
    const state = humanize(
      discoverIntentRecord.state?.status ||
        discoverIntentRecord.intent?.state?.status ||
        discoverIntentRecord.status,
    );
    return {
      status: state || "Acquisition review",
      facts: [
        sourceLabel(discoverIntentRecord.candidate || discoverIntentRecord.intent?.candidate || {}),
        text(discoverIntentRecord.candidate?.coverage || discoverIntentRecord.intent?.candidate?.coverage),
      ],
      next: /approval/i.test(state)
        ? "Review the saved collection request before granting permission."
        : "Check whether the data fits your research and review the documented collection method before collecting it.",
    };
  }

  if (historyEvent) {
    const state = humanize(historyEvent.status || historyEvent.lifecycle || historyEvent.stage);
    return {
      status: state || "Recorded request history",
      facts: [sourceLabel(historyEvent)],
      next: historyEvent.registered_dataset_id
        ? "Open the dataset saved to Library to review what collection produced."
        : "Use the saved record to understand what happened before retrying or changing the collection method.",
    };
  }

  if (discoverAssessment?.active) {
    const result = discoverAssessment.result || discoverAssessment;
    const verdict = assessmentLabel(result, humanize(result.status));
    const gap = assessmentGapText(result);
    return {
      status: verdict || "Coverage assessment",
      facts: [text(discoverAssessment.question || result.question), gap],
      next: gap
        ? "Review the evidence gap and documented collection methods before requesting new data."
        : "Check whether data you have is sufficient before searching more widely for sources.",
    };
  }

  if (browseTarget) {
    const lifecycleLabel = humanize(browseLifecycle?.label || browseLifecycle?.state || browseLifecycle?.status);
    return {
      status: lifecycleLabel || humanize(browseTarget.group_label || browseTarget.analysis_readiness) || "Candidate evidence",
      facts: [sourceLabel(browseTarget), text(browseTarget.coverage || browseTarget.date_range)],
      next: "Check the candidate’s fit, source evidence, and collection method before adding it to Library.",
    };
  }

  if (discoverMode === "history") {
    return {
      status: "Request history",
      facts: [],
      next: "Select a request to review its outcome, evidence, and next available action.",
    };
  }

  if (restingSummary?.hasResults) {
    const external = Number(restingSummary.externalCount ?? restingSummary.external_count ?? 0);
    const held = Number(restingSummary.libraryCount ?? restingSummary.library_count ?? restingSummary.heldCount ?? 0);
    const references = Number(restingSummary.referenceCount ?? restingSummary.reference_count ?? 0);
    const facts = [];
    if (external) facts.push(`${external} external`);
    if (held) facts.push(`${held} Library`);
    if (references) facts.push(`${references} references`);
    return {
      status: "Search evidence assembled",
      facts,
      next: "Compare data in your Library with external candidates before requesting more data.",
    };
  }

  return {
    status: "Ready for an evidence need",
    facts: [],
    next: "State your research need. Discover will show data in your Library, external candidates, and unresolved gaps.",
  };
}

function librarySituation({ dataset, activeObject }) {
  if (dataset?.dataset_id) {
    const status = statusPillKind(dataset);
    const decision = canIUseDecision(dataset);
    const presentation = libraryAssetPresentation(dataset);
    const source = sourceLabel(dataset);
    const shape = text(plainIdentifiers(dataset.grain) || dataset.coverage || dataset.date_range);
    return {
      status: status.label,
      statusKind: status.kind,
      facts: [presentation.noun, source, shape],
      next: decision.body,
    };
  }

  if (activeObject?.kind === "library_folder") {
    const facts = Array.isArray(activeObject.facts)
      ? activeObject.facts.map((fact) => text(fact?.value || fact?.label || fact)).filter(Boolean)
      : [];
    return {
      status: text(activeObject.statusText) || "Evidence estate",
      facts,
      next: "Select evidence to inspect its source and readiness, or add evidence when the Library does not yet cover the research need.",
    };
  }

  if (activeObject?.kind === "library_intake") {
    return {
      status: text(activeObject.statusText) || "Evidence intake",
      facts: [],
      next: "Keep the source history attached while the data is saved to Library and checked for use.",
    };
  }

  return {
    status: "Evidence estate",
    facts: [],
    next: "Select evidence to inspect source, readiness, content, and reuse constraints.",
  };
}

function resourceSituation(resourceRow, resourcesDecisionCount) {
  if (resourceRow) {
    const state = humanize(resourceRow.status || resourceRow.state || resourceRow.health);
    return {
      status: state || "Research capacity",
      facts: [text(resourceRow.label), text(resourceRow.value || resourceRow.detail || resourceRow.summary)],
      next: "Review system resources when a measured limit changes what Research Drive can do.",
    };
  }
  return {
    status: resourcesDecisionCount ? `${resourcesDecisionCount} decision${resourcesDecisionCount === 1 ? "" : "s"}` : "Research capacity",
    facts: [],
    next: "Review only capacity or access conditions that materially constrain research work.",
  };
}

function buildSituation(props) {
  const { mainTab, dataset, activeObject, resourcesDecisionCount = 0 } = props;
  if (mainTab === "library") return librarySituation({ dataset, activeObject });
  if (mainTab === DISCOVER_TAB) return discoverSituation(props);
  if (mainTab === "synthesis" && activeObject?.kind === "synthesis_thread") {
    const thread = activeObject.thread || {};
    if (thread.ephemeral || thread.state?.ephemeral) {
      return {
        status: "Draft",
        facts: ["Not saved"],
        next: "",
      };
    }
    const nodes = Array.isArray(thread?.state?.nodes) ? thread.state.nodes : [];
    const profiles = Array.isArray(thread?.state?.column_profiles) ? thread.state.column_profiles : [];
    const evidenceCount = nodes.filter((node) => node?.layer === "evidence" || node?.type === "source" || node?.type === "construct").length;
    const facts = [
      evidenceCount ? `${evidenceCount} mapped evidence` : "",
      profiles.length ? `${profiles.length} measured` : "",
    ];
    return {
      status: synthesisPhaseLabel(thread) || "Thread",
      facts,
      next: "",
    };
  }
  if (mainTab === "synthesis") {
    return {
      status: "Workspace",
      facts: [],
      next: "Choose a saved build, start from a research question, or reuse a method saved to Library.",
    };
  }
  if (mainTab === "resources") return resourceSituation(props.resourceRow, resourcesDecisionCount);
  if (mainTab === "home") {
    return {
      status: text(activeObject?.statusText) || "Research Drive",
      facts: [],
      next: "Resume the highest-value grounded work or inspect the evidence state behind the next decision.",
    };
  }
  if (mainTab === "profile") {
    return { status: "Research profile", facts: [], next: "Profile context steers research direction without becoming evidence itself." };
  }
  if (mainTab === "settings") {
    return { status: "Research Drive configuration", facts: [], next: "Change Research Drive settings when they affect access, available tools, or how data is handled." };
  }
  return { status: "Research context", facts: [], next: "Inspect the current object or Ask within this scoped context." };
}

function uniqueFacts(values) {
  const seen = new Set();
  return values
    .map(text)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function ResearchSituationRail({
  mainTab,
  railTab,
  onRailTabChange,
  selectionHint,
  activeObject,
  dataset,
  browseTarget,
  browseLifecycle,
  historyEvent,
  discoverIntentRecord,
  discoverAssessment,
  discoverMode,
  restingSummary,
  resourceRow,
  resourcesDecisionCount = 0,
  askAvailable = true,
  onMemberSignIn,
}) {
  const draftSynthesisEntry =
    mainTab === "synthesis" &&
    activeObject?.kind === "synthesis_thread" &&
    Boolean(activeObject?.thread?.ephemeral || activeObject?.thread?.state?.ephemeral);
  const draftEntryWasActive = useRef(false);

  useEffect(() => {
    if (draftSynthesisEntry && !draftEntryWasActive.current) onRailTabChange("detail");
    draftEntryWasActive.current = draftSynthesisEntry;
  }, [draftSynthesisEntry, onRailTabChange]);

  const situation = buildSituation({
    mainTab,
    activeObject,
    dataset,
    browseTarget,
    browseLifecycle,
    historyEvent,
    discoverIntentRecord,
    discoverAssessment,
    discoverMode,
    restingSummary,
    resourceRow,
    resourcesDecisionCount,
  });
  const facts = uniqueFacts(situation.facts || []);

  return (
    <section className="rd-v2-situation" data-testid="research-situation" aria-label="Current research context">
      <div className="rd-v2-situation-topline">
        <span>{surfaceLabel(mainTab)}</span>
        <span className={`rd-v2-situation-state state-${situation.statusKind || "neutral"}`}>{situation.status}</span>
      </div>
      <h2 title={selectionHint}>{selectionHint}</h2>
      {facts.length ? (
        <div className="rd-v2-situation-facts" aria-label="Context facts">
          {facts.map((fact) => <span key={fact}>{fact}</span>)}
        </div>
      ) : null}
      {situation.next ? <p className="rd-v2-situation-next">{situation.next}</p> : null}
      <div className="rd-v2-situation-tabs" role="tablist" aria-label="Inspector mode">
        <button
          type="button"
          role="tab"
          aria-selected={railTab === "detail"}
          className={railTab === "detail" ? "on" : ""}
          onClick={() => onRailTabChange("detail")}
        >
          Detail
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={railTab === "ask"}
          className={railTab === "ask" ? "on" : ""}
          onClick={() => onRailTabChange("ask")}
          data-testid={askAvailable ? "rail-ask-tab" : "rail-ask-sign-in"}
        >
          {askAvailable ? "Ask" : "Ask · sign in"}
        </button>
      </div>
      {!askAvailable && railTab === "ask" && onMemberSignIn ? (
        <button type="button" className="rd-v2-situation-sign-in" onClick={onMemberSignIn}>
          Sign in to continue
        </button>
      ) : null}
    </section>
  );
}

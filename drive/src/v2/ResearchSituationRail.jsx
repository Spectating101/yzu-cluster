import { useEffect, useRef } from "react";
import { canIUseDecision, libraryAssetPresentation, statusPillKind } from "@/v2/datasetMeta";
import { DISCOVER_TAB } from "@/v2/tabIdentity";
import { synthesisJourneyStage } from "@/v2/synthesisLifecycle";
import "@/v2/rail-convergence.css";
import "@/v2/final-convergence.css";

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
  if (mainTab === "settings") return "Desk setup";
  return "Research desk";
}

function synthesisPhaseLabel(thread) {
  const stage = synthesisJourneyStage(thread);
  // "Method" is the researcher-facing name for Specification. Every later
  // state keeps its own journey identity: Proposal, Readiness, Approval,
  // Build, and Result are not interchangeable flavours of "Review".
  if (stage === "specification") return "Method";
  return humanize(stage);
}

function discoverSituation({ browseTarget, browseLifecycle, historyEvent, discoverIntentRecord, discoverAssessment, restingSummary }) {
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
        ? "Review the recorded acquisition request before granting authority."
        : "Confirm evidence fit and the declared acquisition route before collection.",
    };
  }

  if (historyEvent) {
    const state = humanize(historyEvent.status || historyEvent.lifecycle || historyEvent.stage);
    return {
      status: state || "Recorded lifecycle",
      facts: [sourceLabel(historyEvent), text(historyEvent.registered_dataset_id || historyEvent.dataset_id)],
      next: historyEvent.registered_dataset_id
        ? "Open the registered Library object to inspect what the acquisition actually produced."
        : "Use the durable record to understand what happened before retrying or changing route.",
    };
  }

  if (discoverAssessment?.active) {
    const verdict = humanize(discoverAssessment.verdict || discoverAssessment.status);
    return {
      status: verdict || "Coverage assessment",
      facts: [text(discoverAssessment.question), text(discoverAssessment.gap?.statement)],
      next: "Use the coverage assessment to decide whether held evidence is sufficient or wider sourcing is justified.",
    };
  }

  if (browseTarget) {
    const lifecycleLabel = humanize(browseLifecycle?.label || browseLifecycle?.state || browseLifecycle?.status);
    return {
      status: lifecycleLabel || humanize(browseTarget.group_label || browseTarget.analysis_readiness) || "Candidate evidence",
      facts: [sourceLabel(browseTarget), text(browseTarget.coverage || browseTarget.date_range)],
      next: "Confirm fit, source evidence, and collection route before promoting this candidate into the Library.",
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
      next: "Compare held evidence against external candidates before requesting more data.",
    };
  }

  return {
    status: "Ready for an evidence need",
    facts: [],
    next: "State the research need; Discover will separate held evidence, external candidates, and unresolved gaps.",
  };
}

function librarySituation({ dataset, activeObject }) {
  if (dataset?.dataset_id) {
    const status = statusPillKind(dataset);
    const decision = canIUseDecision(dataset);
    const presentation = libraryAssetPresentation(dataset);
    const source = sourceLabel(dataset);
    const shape = text(dataset.grain || dataset.coverage || dataset.date_range);
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
      next: "Keep provenance attached while the new evidence is registered and its usability is established.",
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
      next: "Treat infrastructure as research capacity: act only when a measured constraint changes what the desk can do.",
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
      next: "Open an existing construction or start a new one from the Active work rail.",
    };
  }
  if (mainTab === "resources") return resourceSituation(props.resourceRow, resourcesDecisionCount);
  if (mainTab === "home") {
    return {
      status: text(activeObject?.statusText) || "Research desk",
      facts: [],
      next: "Resume the highest-value grounded work or inspect the evidence state behind the next decision.",
    };
  }
  if (mainTab === "profile") {
    return { status: "Research profile", facts: [], next: "Profile context steers research direction without becoming evidence itself." };
  }
  if (mainTab === "settings") {
    return { status: "Desk configuration", facts: [], next: "Change desk settings only when they alter access, capability, or evidence handling." };
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
  restingSummary,
  resourceRow,
  resourcesDecisionCount = 0,
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
        >
          Ask
        </button>
      </div>
    </section>
  );
}

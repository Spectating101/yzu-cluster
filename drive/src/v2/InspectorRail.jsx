import { useEffect, useState } from "react";
import {
  BrowseRailPanel,
  DetailPanel,
  HomeAttentionRailPanel,
  PageRailPanel,
  ResourcesRailPanel,
} from "@/v2/RailPanels";
import { ProfileDetailPanel } from "@/v2/ProfilePage";
import { activeObjectSelectionHint } from "@/v2/activeObject";
import { displayName } from "@/v2/datasetMeta";
import { LibraryDatasetRailPanel } from "@/v2/LibraryDatasetRailPanel";
import { LibraryFolderRailPanel } from "@/v2/LibraryFolderRailPanel";
import { LibraryIntakeRailPanel } from "@/v2/LibraryIntakeRailPanel";
import { ResourcesOverviewRailPanel } from "@/v2/ResourcesOverviewRailPanel";
import { DiscoverHistoryRailPanel } from "@/v2/DiscoverHistoryRailPanel";
import { DiscoverIntentRailPanel } from "@/v2/DiscoverIntentRailPanel";
import { SynthesisThreadRailPanel } from "@/v2/SynthesisThreadRailPanel";
import { SynthesisIdleRailPanel } from "@/v2/SynthesisIdleRailPanel";
import { ResearchSituationRail } from "@/v2/ResearchSituationRail";
import { DISCOVER_TAB } from "@/v2/tabIdentity";

function railSelectionHint(
  mainTab,
  dataset,
  browseTarget,
  historyEvent,
  discoverIntentRecord,
  discoverAssessment,
  resourceRow,
  restingSummary,
) {
  if (mainTab === DISCOVER_TAB && discoverIntentRecord) {
    return discoverIntentRecord.intent?.title || discoverIntentRecord.candidate?.title || "Acquisition review";
  }
  if (mainTab === DISCOVER_TAB && historyEvent) {
    return historyEvent.target || historyEvent.title || historyEvent.id || "Discover lifecycle item";
  }
  if (mainTab === DISCOVER_TAB && discoverAssessment?.active) {
    return "Coverage assessment";
  }
  if (mainTab === DISCOVER_TAB && browseTarget) {
    return browseTarget.title || browseTarget.dataset_id || "Discover result";
  }
  if (mainTab === DISCOVER_TAB && restingSummary?.hasResults) {
    return "Search summary";
  }
  if (mainTab === DISCOVER_TAB) {
    return "No discover result";
  }
  if (mainTab === "resources" && resourceRow) {
    return resourceRow.label?.split("·")[0]?.trim() || resourceRow.key;
  }
  if (mainTab === "resources") {
    return "Resources";
  }
  if (mainTab === "profile") {
    return "Profile";
  }
  if (mainTab === "settings") {
    return "Desk setup";
  }
  if (mainTab === "synthesis") {
    return "Synthesis";
  }
  if (dataset?.dataset_id) {
    return displayName(dataset);
  }
  return "No selection";
}

const MOBILE_RAIL_IDLE_HINTS = new Set([
  "No selection",
  "No discover result",
  "Resources",
  "Profile",
  "Desk setup",
]);

function activeHintBelongsToTab(mainTab, object) {
  if (!object) return false;
  if (mainTab === "library") {
    return ["library_folder", "library_intake", "dataset"].includes(object.kind);
  }
  if (mainTab === DISCOVER_TAB) {
    return ["external_candidate", "discover_history", "discover_investigation"].includes(object.kind);
  }
  if (mainTab === "resources") return object.kind === "resource_row";
  if (mainTab === "home") {
    return object.kind === "home_attention" || (object.kind === "dataset" && object.owner === "home");
  }
  if (mainTab === "synthesis") return object.kind === "synthesis_thread";
  return false;
}

function DiscoverAssessmentRailSummary({ state, onClose }) {
  const result = state?.result || null;
  const pending = !result;
  const status = pending
    ? "Assessment in progress"
    : String(result?.verdict || result?.assessment_status || "Coverage assessment")
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase());
  const gap = String(result?.gap?.statement || "").trim();
  const held = Array.isArray(result?.held_evidence) ? result.held_evidence.length : 0;
  return (
    <section className="rd-v2-discover-assessment-rail-summary" aria-label="Evidence assessment summary">
      <span className="rd-v2-eyebrow">Evidence position</span>
      <strong>{status}</strong>
      <p>{pending ? "The central Evidence Position is establishing the current verdict. Previous assessment authority is not reused while this is pending." : gap || "No remaining gap was reported by the current assessment."}</p>
      <dl>
        <div><dt>Held evidence</dt><dd>{pending ? "—" : held}</dd></div>
        <div><dt>Centre</dt><dd>{pending ? "Assessment authority" : "Full assessment + sourcing routes"}</dd></div>
      </dl>
      <p className="muted">{pending ? "The rail mirrors state only; it does not run a second assessment." : "Use Detail for the decision summary or Ask to reason within this exact evidence need."}</p>
      {onClose ? <button type="button" className="rd-v2-btn sm" onClick={onClose}>Hide assessment</button> : null}
    </section>
  );
}

function AskSignInPanel({
  providerAvailable,
  memberAccessCodeAvailable,
  onProviderSignIn,
  onMemberCodeSignIn,
}) {
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submitAccessCode = async (event) => {
    event.preventDefault();
    if (!accessCode.trim() || !onMemberCodeSignIn) return;
    setBusy(true);
    setError("");
    try {
      await onMemberCodeSignIn(accessCode);
      setAccessCode("");
    } catch (reason) {
      setError(String(reason?.message || reason || "Member sign-in was not accepted."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rd-v2-ask-sign-in" data-testid="ask-sign-in-gate" aria-label="Sign in to ask">
      <span className="rd-v2-eyebrow">Personal research trail</span>
      <strong>Sign in to ask Research Drive.</strong>
      <p>
        Shared Library and Discover evidence remain available here. Asking and saved research work begin with a named member session.
      </p>
      {providerAvailable && onProviderSignIn ? (
        <button type="button" className="rd-v2-btn primary" onClick={onProviderSignIn}>
          Continue with email
        </button>
      ) : null}
      {memberAccessCodeAvailable && onMemberCodeSignIn ? (
        <form className="rd-v2-member-code-form" onSubmit={submitAccessCode}>
          <label htmlFor="rd-member-access-code">
            {providerAvailable ? "Or use an invitation code" : "Invitation code"}
          </label>
          <input
            id="rd-member-access-code"
            type="password"
            autoComplete="one-time-code"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder="Enter your invitation code"
          />
          <button type="submit" className="rd-v2-btn primary" disabled={busy || !accessCode.trim()}>
            {busy ? "Signing in…" : "Sign in to Ask"}
          </button>
          {error ? <p className="rd-v2-member-code-error" role="alert">{error}</p> : null}
        </form>
      ) : null}
      {!memberAccessCodeAvailable && !providerAvailable ? (
        <p className="muted">Member sign-in is not enabled on this host yet.</p>
      ) : null}
    </section>
  );
}

export function InspectorRail({
  mainTab,
  railTab,
  onRailTabChange,
  dataset,
  detailLoading,
  browseTarget,
  historyEvent,
  historyJob,
  discoverIntentRecord,
  discoverAssessment,
  discoverCatalog = [],
  onDiscoverAssessmentChange,
  onDiscoverAssessmentActive,
  onCloseDiscoverAssessment,
  onSuggestDiscoverSearch,
  discoverRestingSummary = null,
  resourceRow,
  resourcesRollup,
  resourcesDecisionCount,
  allowOperations = true,
  activeObject,
  previewOpen = false,
  onPreview,
  onAskAbout,
  onAddToLab,
  onPreviewExternal,
  onProbeSource,
  probeState,
  onOpenInLibrary,
  labIds,
  browseLifecycle = null,
  onTrackResources,
  onReviewApproval,
  onRetryLifecycleRefresh,
  onReviewHistoryRequest,
  onApproveJob,
  onRefresh,
  onViewActivity,
  onStartLibraryUpload,
  onStartLibraryUrl,
  onStartLibraryProcure,
  onSubmitLibraryUpload,
  onSubmitLibraryUrl,
  onSubmitLibraryProcure,
  askPanel,
  askAvailable = true,
  memberAccessCodeAvailable = false,
  memberProviderSignInAvailable = false,
  onMemberSignIn,
  onMemberCodeSignIn,
  profile = null,
  allowProfilePreview = false,
}) {
  let detailPanel;
  if (mainTab === "synthesis" && activeObject?.kind === "synthesis_thread") {
    detailPanel = (
      <SynthesisThreadRailPanel
        thread={activeObject.thread}
        onAskAbout={onAskAbout}
        onOpenInLibrary={onOpenInLibrary}
      />
    );
  } else if (mainTab === DISCOVER_TAB) {
    detailPanel = discoverIntentRecord ? (
      <DiscoverIntentRailPanel record={discoverIntentRecord} />
    ) : historyEvent ? (
      <DiscoverHistoryRailPanel
        event={historyEvent}
        job={historyJob}
        onAskAbout={onAskAbout}
        onReviewRequest={onReviewHistoryRequest}
      />
    ) : discoverAssessment?.active ? (
      <DiscoverAssessmentRailSummary state={discoverAssessment} onClose={onCloseDiscoverAssessment} />
    ) : (
      <BrowseRailPanel
        target={browseTarget}
        labIds={labIds}
        catalog={discoverCatalog}
        restingSummary={discoverRestingSummary}
        intentRecord={discoverIntentRecord}
        onAskAbout={onAskAbout}
        onAddToLab={onAddToLab}
        onRequireMemberAccess={() => onRailTabChange?.("ask")}
        onPreviewExternal={onPreviewExternal}
        onProbeSource={onProbeSource}
        probeState={probeState}
        onOpenInLibrary={onOpenInLibrary}
        lifecycle={browseLifecycle}
        onTrackResources={onTrackResources}
        onReviewApproval={onReviewApproval}
        onRetryLifecycleRefresh={onRetryLifecycleRefresh}
      />
    );
  } else if (mainTab === "resources" && !allowOperations) {
    detailPanel = <PageRailPanel page="resources" />;
  } else if (mainTab === "resources") {
    detailPanel = resourceRow ? (
      <ResourcesRailPanel
        row={resourceRow}
        rollup={resourcesRollup}
        onApproveJob={onApproveJob}
        onRefresh={onRefresh}
        onViewActivity={onViewActivity}
        onAskAbout={onAskAbout}
      />
    ) : (
      <ResourcesOverviewRailPanel
        rollup={resourcesRollup}
        decisionCount={resourcesDecisionCount}
        onViewActivity={onViewActivity}
      />
    );
  } else if (mainTab === "profile") {
    detailPanel = <ProfileDetailPanel profile={profile} allowExamplePreview={allowProfilePreview} />;
  } else if (mainTab === "settings") {
    detailPanel = <PageRailPanel page="settings" onAskAbout={onAskAbout} />;
  } else if (mainTab === "synthesis") {
    detailPanel = <SynthesisIdleRailPanel onAskAbout={onAskAbout} />;
  } else if (mainTab === "library" && dataset?.dataset_id) {
    // Dataset selection wins over folder/page guide (Continue / row click must show SOURCE+VERIFY).
    detailPanel = (
      <LibraryDatasetRailPanel
        dataset={dataset}
        previewOpen={previewOpen}
        onPreview={onPreview}
        onAskAbout={onAskAbout}
      />
    );
  } else if (mainTab === "library" && activeObject?.kind === "library_folder") {
    detailPanel = (
      <LibraryFolderRailPanel
        object={activeObject}
        onAskAbout={onAskAbout}
        onStartUpload={onStartLibraryUpload}
        onStartUrl={onStartLibraryUrl}
        onStartProcure={onStartLibraryProcure}
      />
    );
  } else if (mainTab === "library" && activeObject?.kind === "library_intake") {
    detailPanel = (
      <LibraryIntakeRailPanel
        object={activeObject}
        onSubmitUpload={onSubmitLibraryUpload}
        onSubmitUrl={onSubmitLibraryUrl}
        onSubmitProcure={onSubmitLibraryProcure}
      />
    );
  } else if (mainTab === "library" && !dataset?.dataset_id) {
    detailPanel = <PageRailPanel page="library" onAskAbout={onAskAbout} />;
  } else if (mainTab === "home" && activeObject?.kind === "home_attention") {
    detailPanel = <HomeAttentionRailPanel object={activeObject} onAskAbout={onAskAbout} />;
  } else if (
    mainTab === "home" &&
    dataset?.dataset_id &&
    activeObject?.kind === "dataset" &&
    activeObject?.owner === "home"
  ) {
    detailPanel = (
      <LibraryDatasetRailPanel
        dataset={dataset}
        previewOpen={previewOpen}
        onPreview={onPreview}
        onAskAbout={onAskAbout}
      />
    );
  } else if (mainTab === "home") {
    detailPanel = <PageRailPanel page="home" onAskAbout={onAskAbout} />;
  } else {
    detailPanel = (
      <DetailPanel
        dataset={dataset}
        loading={detailLoading}
        onPreview={onPreview}
        onAskAbout={onAskAbout}
      />
    );
  }

  const allowActiveHint = activeHintBelongsToTab(mainTab, activeObject);
  const selectionHint =
    (allowActiveHint ? activeObjectSelectionHint(activeObject) : "") ||
    railSelectionHint(
      mainTab,
      dataset,
      browseTarget,
      historyEvent,
      discoverIntentRecord,
      discoverAssessment,
      resourceRow,
      discoverRestingSummary,
    );

  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  useEffect(() => {
    if (mainTab === DISCOVER_TAB) {
      setMobileRailOpen(
        Boolean(discoverAssessment?.active) ||
          Boolean(historyEvent) ||
          Boolean(discoverIntentRecord) ||
          (Boolean(browseTarget) && railTab === "ask"),
      );
      return;
    }
    // Ask is an explicit working state on every surface. Do not collapse the
    // mobile sheet merely because Profile, Settings, or another page has no
    // selected row.
    if (railTab === "ask") {
      setMobileRailOpen(true);
      return;
    }
    if (mainTab === "home" || mainTab === "synthesis") {
      setMobileRailOpen(false);
      return;
    }
    // A selected Library asset is already a full evidence dossier. On phones,
    // keep that dossier primary and leave the contextual rail one tap away;
    // desktop ignores the collapsed geometry and still renders the full rail.
    if (mainTab === "library" && dataset?.dataset_id && railTab === "detail") {
      setMobileRailOpen(false);
      return;
    }
    if (mainTab === "library" && activeObject?.kind === "library_folder") {
      setMobileRailOpen(false);
      return;
    }
    if (MOBILE_RAIL_IDLE_HINTS.has(selectionHint)) {
      setMobileRailOpen(false);
      return;
    }
    setMobileRailOpen(true);
  }, [
    selectionHint,
    mainTab,
    dataset?.dataset_id,
    browseTarget,
    historyEvent,
    discoverIntentRecord,
    discoverAssessment?.active,
    discoverRestingSummary?.hasResults,
    railTab,
    activeObject?.kind,
  ]);

  return (
    <aside
      className={`yzu-inspector rd-v2-rail${mobileRailOpen ? "" : " rd-v2-rail-collapsed"}`}
      aria-label="Inspector"
    >
      <div className="yzu-inspector-stack rd-v2-rail-stack">
        <div className="rd-v2-rail-chrome">
          <button
            type="button"
            className="rd-v2-rail-mobile-grip"
            aria-expanded={mobileRailOpen}
            onClick={() => setMobileRailOpen((open) => !open)}
          >
            {mobileRailOpen ? "Hide panel" : "Show research context"}
          </button>
        </div>
        <ResearchSituationRail
          mainTab={mainTab}
          railTab={railTab}
          onRailTabChange={onRailTabChange}
          selectionHint={selectionHint}
          activeObject={activeObject}
          dataset={dataset}
          browseTarget={browseTarget}
          browseLifecycle={browseLifecycle}
          historyEvent={historyEvent}
          discoverIntentRecord={discoverIntentRecord}
          discoverAssessment={discoverAssessment}
          restingSummary={discoverRestingSummary}
          resourceRow={resourceRow}
          resourcesDecisionCount={resourcesDecisionCount}
          askAvailable={askAvailable}
          onMemberSignIn={onMemberSignIn}
        />
        <div
          className={`rd-v2-rail-pane${railTab === "detail" ? " rd-v2-rail-pane-on" : ""}`}
          aria-hidden={railTab !== "detail"}
          data-testid="rail-pane-detail"
        >
          {detailPanel}
        </div>
        <div
          className={`rd-v2-rail-pane rd-v2-ask-rail${railTab === "ask" ? " rd-v2-rail-pane-on" : ""}`}
          aria-hidden={railTab !== "ask"}
          data-testid="rail-pane-ask"
        >
          {askPanel || (
            <AskSignInPanel
              providerAvailable={memberProviderSignInAvailable}
              memberAccessCodeAvailable={memberAccessCodeAvailable}
              onProviderSignIn={onMemberSignIn}
              onMemberCodeSignIn={onMemberCodeSignIn}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

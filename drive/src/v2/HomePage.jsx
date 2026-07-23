import { useMemo } from "react";
import { CatalogList } from "@/v2/CatalogList";
import { Skeleton } from "@/v2/InteractionFeedback";
import { deskPipelineStrips } from "@/v2/deskSeed";
import { recentDatasets } from "@/v2/recent";
import { PageShell, SectionTitle } from "@/v2/ui";
import { displayName, statusPillKind } from "@/v2/datasetMeta";
import { facultyFacingRecords, isInternalValidationRecord, rankFacultyHomeRecords } from "@/v2/productVisibility";
import { RESEARCH_ACTIONS } from "@/v2/researchValue";

function datasetListItem(row) {
  return { kind: "dataset", id: row.dataset_id, name: row.name, row };
}

function jobTitle(job) {
  return job?.plan?.title || job?.title || job?.name || job?.dataset_id || job?.type || "Acquisition plan";
}

function purposeLine(dataset) {
  return dataset?.summary || dataset?.description || dataset?.purpose || [dataset?.source, dataset?.coverage, dataset?.grain].filter(Boolean).join(" · ") || "Evidence asset in the faculty research estate";
}

function isRunning(job) {
  return /queued|running|claimed|archiv|register/i.test(String(job?.status || job?.state || ""));
}

function AttentionRow({ item, onOpen, onAsk }) {
  return (
    <article className={`rd-v2-home-attention-row${item.warn ? " warn" : ""}`} data-kind={item.kind} aria-label={`${item.label}: ${item.title}`}>
      <span className="rd-v2-home-attention-label">{item.label}</span>
      <div className="rd-v2-home-attention-main">
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
      </div>
      <span className="rd-v2-home-attention-metric">{item.metric}</span>
      <div className="rd-v2-home-attention-actions">
        {item.prompt ? <button type="button" className="rd-v2-btn sm" onClick={() => onAsk?.(item)}>{item.askLabel || "Assess research state"}</button> : null}
        <button type="button" className={`rd-v2-btn sm${item.warn ? " primary" : ""}`} onClick={() => onOpen?.(item)}>{item.actionLabel || "Inspect research object"}</button>
      </div>
    </article>
  );
}

function ContextStrip({ holdings, queryReady, running, pending }) {
  const rows = [
    ["Research estate", holdings, "Faculty-facing evidence assets"],
    ["Ready evidence", queryReady, "Available for analysis now"],
    ["Active acquisitions", running, "Collection or registration progressing"],
    ["Decisions waiting", pending, "Human review required"],
  ];
  return (
    <section className="rd-recovery-home-context" aria-label="Research estate pulse">
      {rows.map(([label, value, detail]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </article>
      ))}
    </section>
  );
}

export function HomePage({
  datasets = [],
  health,
  profile = null,
  acquisitions = [],
  jobs = [],
  usingSeed = false,
  onAskComposer,
  onGoTab,
  onOpenAttention,
  onSelectDataset,
  onPreviewDataset,
  onAskAttention,
}) {
  const visibleDatasets = useMemo(() => rankFacultyHomeRecords(datasets), [datasets]);
  const visibleJobs = useMemo(() => facultyFacingRecords(jobs), [jobs]);
  const visibleAcquisitions = useMemo(() => facultyFacingRecords(acquisitions), [acquisitions]);
  const recent = useMemo(() => recentDatasets(visibleDatasets, 5), [visibleDatasets]);
  const continueDs = recent[0] || visibleDatasets[0] || null;
  const loading = health == null && datasets.length === 0;
  const pendingJobs = useMemo(
    () => visibleJobs.filter((job) => /pending|approval|hold/i.test(String(job?.status || job?.state || ""))),
    [visibleJobs],
  );
  const runningJobs = useMemo(() => visibleJobs.filter(isRunning), [visibleJobs]);
  const pipeline = useMemo(
    () => deskPipelineStrips(health, visibleAcquisitions).filter((row) => !isInternalValidationRecord(row)),
    [health, visibleAcquisitions],
  );
  const pending = pendingJobs.length;
  const running = Math.max(runningJobs.length, pipeline.filter((row) => row?.stage === "running").length);
  const queryReady = visibleDatasets.filter((row) => statusPillKind(row).kind === "query-ready").length;
  const recentRows = recent.length ? recent : visibleDatasets.slice(0, 5);

  const attentionItems = useMemo(() => {
    const items = [];
    const firstPending = pendingJobs[0];
    if (pending > 0) {
      const title = firstPending ? jobTitle(firstPending) : "Acquisition approval waiting";
      items.push({
        id: "approval",
        kind: "approval",
        label: "Research decision",
        title,
        metric: `${pending} waiting`,
        detail: "Review source, coverage, access, cost, and destination before material work starts.",
        tab: "browse",
        warn: true,
        actionLabel: RESEARCH_ACTIONS.reviewAcquisition,
        askLabel: "Assess decision",
        prompt: `Review the pending acquisition plan for ${title}. Check research fit, source authority, access, cost, destination, and whether it should proceed.`,
      });
    }

    const firstPipeline = pipeline[0] || runningJobs[0];
    if (running > 0 || firstPipeline) {
      const title = firstPipeline?.name || firstPipeline?.title || jobTitle(firstPipeline);
      const metric = firstPipeline?.amount || firstPipeline?.subtitle || `${running || 1} active`;
      items.push({
        id: "procurement",
        kind: "procurement",
        label: "Acquisition",
        title,
        metric,
        detail: "Collection, verification, preservation, and registration remain attached to one durable lifecycle.",
        tab: "resources",
        actionLabel: "Inspect acquisition state",
        askLabel: "Explain acquisition",
        resourceRow: {
          kind: "active",
          key: firstPipeline?.id || "jobs-running",
          label: title,
          metric,
          section: "active",
          warn: firstPipeline?.stage === "warn",
          ok: firstPipeline?.stage !== "warn",
          job: firstPipeline?.status ? firstPipeline : undefined,
          meta: firstPipeline,
        },
        prompt: `Explain the active acquisition ${title} (${metric}). Summarize progress, blockers, resource use, verification state, and the next safe action.`,
      });
    }

    items.push({
      id: "library",
      kind: "library",
      label: "Evidence estate",
      title: "Faculty research estate",
      metric: `${visibleDatasets.length} assets`,
      detail: `${queryReady} ready for analysis. Inspect held evidence, verify research fit, or add a missing source.`,
      tab: "library",
      actionLabel: "Inspect evidence estate",
      askLabel: "Assess evidence coverage",
      prompt: `Summarize evidence readiness across ${visibleDatasets.length} faculty-facing assets and identify the most material evidence gap.`,
    });

    items.push({
      id: "discover",
      kind: "discover",
      label: "Evidence gap",
      title: "Investigate missing evidence",
      metric: "Held → connected → missing",
      detail: "Search controlled evidence first, then compare realistic acquisition routes without hiding uncertainty.",
      tab: "browse",
      actionLabel: RESEARCH_ACTIONS.investigateGap,
      askLabel: "Frame evidence need",
      prompt: "Find missing evidence for the current faculty workspace. Search the research estate first, then compare supported external routes and preserve uncertainty.",
    });
    return items;
  }, [pendingJobs, pending, pipeline, queryReady, running, runningJobs, visibleDatasets.length]);

  const suggestedGaps = useMemo(() => {
    const fromProfile = (profile?.procurement_recommendations || [])
      .map((row) => row?.search_query || row?.title || row?.prompt)
      .filter(Boolean)
      .slice(0, 3);
    return fromProfile.length ? fromProfile : [
      "TWSE governance and disclosure corrections",
      "MOPS filings and amendment relationships",
      "Stablecoin incidents, attention, and peg adoption",
    ];
  }, [profile]);

  const openAttention = (item) => {
    if (item?.resourceRow || item?.kind === "approval") onOpenAttention?.(item);
    else onGoTab?.(item?.tab || "home");
  };

  const inspectCurrentEvidence = () => {
    if (!continueDs) {
      onGoTab?.("library");
      return;
    }
    onSelectDataset?.(continueDs);
    onPreviewDataset?.(continueDs);
  };

  const openContinueInLibrary = () => {
    if (continueDs) onSelectDataset?.(continueDs);
    onGoTab?.("library");
  };

  return (
    <PageShell className="rd-v2-home-page rd-recovery-home-page" title="Research brief" lead="Continue research, review decisions, and move newly controlled evidence into active work.">
      <ContextStrip holdings={visibleDatasets.length} queryReady={queryReady} running={running} pending={pending} />

      <section className="rd-v2-home-continue-card rd-recovery-home-continue" aria-label="Current evidence asset" aria-busy={loading} data-testid="home-continue">
        <div className="rd-v2-home-continue-copy">
          {loading ? (
            <><span>Restoring research context</span><Skeleton lines={3} label="Loading the most recent evidence asset" /></>
          ) : continueDs ? (
            <>
              <span>{usingSeed ? "Offline sample" : recent.length ? "Continue from controlled evidence" : "Start from held evidence"}</span>
              <h2>{displayName(continueDs)}</h2>
              <p className="rd-v2-home-continue-purpose">{purposeLine(continueDs)}</p>
              <p className="rd-v2-home-continue-meta">
                <span className="rd-v2-pill">{statusPillKind(continueDs).label}</span>
                <span>{queryReady} ready for analysis · {visibleDatasets.length} controlled assets{pending ? ` · ${pending} research decision${pending === 1 ? "" : "s"} waiting` : ""}</span>
              </p>
              <p className="rd-v2-home-continue-id mono">{continueDs.dataset_id}</p>
            </>
          ) : (
            <><span>Begin</span><h2>Inspect the research estate or investigate an evidence gap</h2><p>No faculty-facing evidence asset is ready to continue yet. Validation records remain available in technical views but do not define this workspace.</p></>
          )}
        </div>
        {!loading ? (
          <div className="rd-v2-home-continue-actions">
            <button type="button" className="rd-v2-btn sm primary" onClick={inspectCurrentEvidence}>{continueDs ? RESEARCH_ACTIONS.inspectEvidence : "Open evidence estate"}</button>
            {continueDs ? <button type="button" className="rd-v2-btn sm" onClick={openContinueInLibrary}>Locate in Library</button> : null}
          </div>
        ) : null}
      </section>

      <section className="rd-v2-home-attention" aria-label="Research decisions and active work">
        <div className="rd-v2-home-attention-head"><h2>Decisions and active work</h2><span>{attentionItems.length} research objects</span></div>
        <div className="rd-v2-home-attention-body">
          {attentionItems.slice(0, 4).map((item) => <AttentionRow key={item.id} item={item} onOpen={openAttention} onAsk={onAskAttention} />)}
        </div>
      </section>

      <section className="rd-v2-home-recent" aria-label="Newly available evidence">
        <SectionTitle title="Newly available evidence" actionLabel="Inspect estate →" onAction={() => onGoTab?.("library")} />
        <div className="rd-v2-home-list-panel">
          {loading ? <Skeleton lines={3} label="Loading evidence assets" /> : recentRows.length ? (
            <CatalogList rows={recentRows.slice(0, 4).map(datasetListItem)} onSelectDataset={onSelectDataset} onDoubleClick={onPreviewDataset} compact />
          ) : <p className="rd-v2-empty-inline">No faculty-facing evidence asset has been opened yet.</p>}
        </div>
      </section>

      <section className="rd-v2-home-gaps rd-recovery-home-gaps" aria-label="Evidence gaps to investigate">
        <div className="rd-v2-home-attention-head"><h2>Evidence gaps to investigate</h2><span>Research Drive can frame routes</span></div>
        <div className="rd-recovery-gap-list">
          {suggestedGaps.map((gap) => (
            <button
              key={gap}
              type="button"
              onClick={() => onAskComposer?.({
                prompt: `Investigate this possible evidence gap: ${gap}. Search held evidence first, then compare supported external sources and identify what remains unverified.`,
                displayText: gap,
              })}
            >
              <strong>{gap}</strong><span>{RESEARCH_ACTIONS.investigateGap} →</span>
            </button>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

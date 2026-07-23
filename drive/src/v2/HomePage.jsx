import { useMemo } from "react";
import { CatalogList } from "@/v2/CatalogList";
import { Skeleton } from "@/v2/InteractionFeedback";
import { deskPipelineStrips } from "@/v2/deskSeed";
import { recentDatasets } from "@/v2/recent";
import { PageShell, SectionTitle } from "@/v2/ui";
import { displayName, statusPillKind } from "@/v2/datasetMeta";
import { facultyFacingRecords, isInternalValidationRecord } from "@/v2/productVisibility";

function datasetListItem(row) {
  return { kind: "dataset", id: row.dataset_id, name: row.name, row };
}

function jobTitle(job) {
  return job?.plan?.title || job?.title || job?.name || job?.dataset_id || job?.type || "Procurement job";
}

function purposeLine(dataset) {
  return dataset?.summary || dataset?.description || dataset?.purpose || [dataset?.source, dataset?.coverage, dataset?.grain].filter(Boolean).join(" · ") || "Research dataset in the faculty vault";
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
        {item.prompt ? <button type="button" className="rd-v2-btn sm" onClick={() => onAsk?.(item)}>Ask</button> : null}
        <button type="button" className={`rd-v2-btn sm${item.warn ? " primary" : ""}`} onClick={() => onOpen?.(item)}>Open</button>
      </div>
    </article>
  );
}

function ContextStrip({ holdings, queryReady, running, pending }) {
  const rows = [
    ["Holdings", holdings, "Faculty-facing assets in the vault"],
    ["Query ready", queryReady, "Available for analysis now"],
    ["Running", running, "Active collection or registration"],
    ["Needs review", pending, "Material decisions waiting"],
  ];
  return (
    <section className="rd-recovery-home-context" aria-label="Research context summary">
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
  const visibleDatasets = useMemo(() => facultyFacingRecords(datasets), [datasets]);
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
      const title = firstPending ? jobTitle(firstPending) : "Procurement approval waiting";
      items.push({
        id: "approval",
        kind: "approval",
        label: "Approval",
        title,
        metric: `${pending} pending`,
        detail: "Review source, scope, cost, and destination before material work starts.",
        tab: "browse",
        warn: true,
        prompt: `Review the pending procurement approval for ${title}. Check research fit, source authority, access, cost, destination, and whether it should proceed.`,
      });
    }

    const firstPipeline = pipeline[0] || runningJobs[0];
    if (running > 0 || firstPipeline) {
      const title = firstPipeline?.name || firstPipeline?.title || jobTitle(firstPipeline);
      const metric = firstPipeline?.amount || firstPipeline?.subtitle || `${running || 1} running`;
      items.push({
        id: "procurement",
        kind: "procurement",
        label: "Running",
        title,
        metric,
        detail: "Live acquisition or registration remains attached to its durable lifecycle.",
        tab: "resources",
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
        prompt: `Explain the current run ${title} (${metric}). Summarize progress, blockers, resource use, and the next safe action.`,
      });
    }

    items.push({
      id: "library",
      kind: "library",
      label: "Library",
      title: "Faculty vault",
      metric: `${visibleDatasets.length} holdings`,
      detail: `${queryReady} query-ready. Inspect held evidence, open an exact branch, or add a source.`,
      tab: "library",
      prompt: `Summarize Library readiness across ${visibleDatasets.length} faculty-facing holdings and identify the most material evidence gap.`,
    });

    items.push({
      id: "discover",
      kind: "discover",
      label: "Discover",
      title: "Find missing data",
      metric: "Search and probe",
      detail: "Search held evidence first, then investigate realistic external routes without hiding uncertainty.",
      tab: "browse",
      prompt: "Find missing evidence for the current faculty workspace. Search the lab first, then compare supported external routes and preserve uncertainty.",
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

  const continueWork = () => {
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
    <PageShell className="rd-v2-home-page rd-recovery-home-page" title="Home" lead="Resume active research, review material decisions, and move directly into held evidence.">
      <ContextStrip holdings={visibleDatasets.length} queryReady={queryReady} running={running} pending={pending} />

      <section className="rd-v2-home-continue-card rd-recovery-home-continue" aria-label="Continue working" aria-busy={loading} data-testid="home-continue">
        <div className="rd-v2-home-continue-copy">
          {loading ? (
            <><span>Restoring research context</span><Skeleton lines={3} label="Loading the most recent research asset" /></>
          ) : continueDs ? (
            <>
              <span>{usingSeed ? "Offline sample" : recent.length ? "Continue" : "Start from held evidence"}</span>
              <h2>{displayName(continueDs)}</h2>
              <p className="rd-v2-home-continue-purpose">{purposeLine(continueDs)}</p>
              <p className="rd-v2-home-continue-meta">
                <span className="rd-v2-pill">{statusPillKind(continueDs).label}</span>
                <span>{queryReady} query-ready · {visibleDatasets.length} holdings{pending ? ` · ${pending} awaiting approval` : ""}</span>
              </p>
              <p className="rd-v2-home-continue-id mono">{continueDs.dataset_id}</p>
            </>
          ) : (
            <><span>Start</span><h2>Open the vault or find missing data</h2><p>No faculty-facing research asset is ready to continue yet. Validation records remain available in technical views but do not define this workspace.</p></>
          )}
        </div>
        {!loading ? (
          <div className="rd-v2-home-continue-actions">
            <button type="button" className="rd-v2-btn sm primary" onClick={continueWork}>{continueDs ? "Continue" : "Open Library"}</button>
            {continueDs ? <button type="button" className="rd-v2-btn sm" onClick={openContinueInLibrary}>Open in Library</button> : null}
          </div>
        ) : null}
      </section>

      <section className="rd-v2-home-attention" aria-label="Attention queue">
        <div className="rd-v2-home-attention-head"><h2>Needs attention</h2><span>{attentionItems.length} items</span></div>
        <div className="rd-v2-home-attention-body">
          {attentionItems.slice(0, 4).map((item) => <AttentionRow key={item.id} item={item} onOpen={openAttention} onAsk={onAskAttention} />)}
        </div>
      </section>

      <section className="rd-v2-home-recent" aria-label="Recent research assets">
        <SectionTitle title="Recent" actionLabel="See Library →" onAction={() => onGoTab?.("library")} />
        <div className="rd-v2-home-list-panel">
          {loading ? <Skeleton lines={3} label="Loading recent research assets" /> : recentRows.length ? (
            <CatalogList rows={recentRows.slice(0, 4).map(datasetListItem)} onSelectDataset={onSelectDataset} onDoubleClick={onPreviewDataset} compact />
          ) : <p className="rd-v2-empty-inline">No faculty-facing asset has been opened yet.</p>}
        </div>
      </section>

      <section className="rd-v2-home-gaps rd-recovery-home-gaps" aria-label="Suggested gaps">
        <div className="rd-v2-home-attention-head"><h2>Suggested gaps</h2><span>Agent-steerable</span></div>
        <div className="rd-recovery-gap-list">
          {suggestedGaps.map((gap) => (
            <button
              key={gap}
              type="button"
              onClick={() => onAskComposer?.({
                prompt: `Investigate this possible research gap: ${gap}. Search held evidence first, then compare supported external sources and identify what remains unverified.`,
                displayText: gap,
              })}
            >
              <strong>{gap}</strong><span>Investigate with Research Drive →</span>
            </button>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

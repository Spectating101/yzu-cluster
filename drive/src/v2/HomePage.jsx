import { useMemo } from "react";
import { CatalogList } from "@/v2/CatalogList";
import { GuidedState, Skeleton } from "@/v2/InteractionFeedback";
import { recentDatasets } from "@/v2/recent";
import { PageShell, SectionTitle } from "@/v2/ui";
import { displayName, statusPill } from "@/v2/datasetMeta";

function datasetListItem(row) {
  return {
    kind: "dataset",
    id: row.dataset_id,
    name: row.name,
    row,
  };
}

function jobTitle(job) {
  return (
    job?.plan?.title ||
    job?.title ||
    job?.name ||
    job?.dataset_id ||
    job?.type ||
    "Procurement job"
  );
}

function purposeLine(ds) {
  return (
    ds?.summary ||
    ds?.description ||
    ds?.purpose ||
    [ds?.source, ds?.coverage, ds?.grain].filter(Boolean).join(" · ") ||
    "Research dataset in the faculty vault"
  );
}

function lastActivityLine(ds) {
  const stamp = ds?.updated_at || ds?.last_accessed || ds?.last_activity || ds?.as_of;
  if (stamp) return `Last activity · ${stamp}`;
  if (ds?.coverage) return `Coverage · ${ds.coverage}`;
  return "Available in the faculty vault";
}

function isQueryReady(row) {
  return /instant|query.?ready|connected/i.test(
    String(row?.analysis_readiness || row?.readiness || row?.status || ""),
  );
}

function isRunningJob(job) {
  return /queued|running|claimed|archiving|registering/i.test(
    String(job?.status || job?.state || ""),
  );
}

function HomeContinueSkeleton() {
  return (
    <div className="rd-v2-home-loading-copy" data-testid="home-loading-state">
      <span>Restoring research context</span>
      <Skeleton lines={3} label="Loading the most recent research asset" />
      <div className="rd-v2-home-loading-meta">
        <Skeleton lines={1} label="Loading readiness" />
        <Skeleton lines={1} label="Loading activity" />
      </div>
    </div>
  );
}

function ResearchLifecycle({ holdings, queryReady, onGoTab, onAskComposer }) {
  const steps = [
    {
      id: "find",
      label: "Find",
      detail: `${holdings} holdings plus external indexes`,
      action: () => onGoTab("browse"),
    },
    {
      id: "verify",
      label: "Verify",
      detail: `${queryReady} query-ready · coverage, provenance, readiness`,
      action: () => onGoTab("library"),
    },
    {
      id: "acquire",
      label: "Acquire",
      detail: "Probe → approve → worker → vault",
      action: () => onGoTab("browse"),
    },
    {
      id: "synthesize",
      label: "Synthesize",
      detail: "Join registered evidence into reusable panels",
      action: () => onGoTab("synthesis"),
    },
  ];

  return (
    <section className="rd-rc3-lifecycle" aria-label="Research lifecycle">
      {steps.map((step, index) => (
        <button key={step.id} type="button" onClick={step.action}>
          <span className="rd-rc3-lifecycle-index">0{index + 1}</span>
          <strong>{step.label}</strong>
          <small>{step.detail}</small>
        </button>
      ))}
      <button
        type="button"
        className="rd-rc3-lifecycle-command"
        onClick={() =>
          onAskComposer?.({
            prompt:
              "Review the current faculty data estate and suggest the most material research gap to investigate next. Separate held evidence, missing evidence, access constraints, and executable next steps.",
            displayText: "What should the lab investigate next?",
          })
        }
      >
        <span>Language steers the desk</span>
        <strong>Ask across the workflow →</strong>
      </button>
    </section>
  );
}

function AttentionRow({ item, onOpen, onAsk }) {
  return (
    <article
      className={`rd-v2-home-attention-row${item.warn ? " warn" : ""}`}
      data-kind={item.kind}
      aria-label={`${item.label}: ${item.title}`}
    >
      <span className="rd-v2-home-attention-label">{item.label}</span>
      <div className="rd-v2-home-attention-main">
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
        <small>{item.next}</small>
      </div>
      <span className="rd-v2-home-attention-metric">{item.metric}</span>
      <div className="rd-v2-home-attention-actions">
        <button type="button" className="rd-v2-btn sm" onClick={() => onAsk?.(item)}>
          Ask
        </button>
        <button type="button" className="rd-v2-btn sm primary" onClick={() => onOpen(item)}>
          Review
        </button>
      </div>
    </article>
  );
}

function ResearchStateBrief({ continueDs, runningJobs, pending, onGoTab }) {
  const changeTitle = runningJobs[0] ? jobTitle(runningJobs[0]) : continueDs ? displayName(continueDs) : "Faculty vault";
  const changeDetail = runningJobs[0]
    ? `${String(runningJobs[0]?.status || runningJobs[0]?.state || "running").replace(/_/g, " ")} · execution remains attached to Discover History`
    : continueDs
      ? `${statusPill(continueDs)} · ${lastActivityLine(continueDs)}`
      : "No recent research object has been restored in this browser.";

  return (
    <section className="rd-rc3-home-brief" aria-label="Research state brief">
      <div className="rd-rc3-home-brief-lead">
        <span>What matters now</span>
        <h2>{pending ? `${pending} decision${pending === 1 ? "" : "s"} can change research progress` : "The desk has no blocked decision"}</h2>
        <p>
          Home is a working brief, not the full catalogue. Continue active research, resolve consequential work, or return to the evidence estate.
        </p>
      </div>
      <div className="rd-rc3-home-brief-facts">
        <article>
          <small>Latest material change</small>
          <strong>{changeTitle}</strong>
          <span>{changeDetail}</span>
        </article>
        <article>
          <small>Research continuity</small>
          <strong>{continueDs ? "A reusable asset is ready to resume" : "Open the estate or start a search"}</strong>
          <span>{continueDs ? purposeLine(continueDs) : "Discover and Library remain the two evidence entrances."}</span>
        </article>
        <button type="button" onClick={() => onGoTab("browse")}>
          <small>Open exploration</small>
          <strong>Investigate missing evidence →</strong>
        </button>
      </div>
    </section>
  );
}

export function HomePage({
  datasets,
  health,
  jobs = [],
  onAskComposer,
  onGoTab,
  onOpenAttention,
  onSelectDataset,
  onPreviewDataset,
  onAskAttention,
}) {
  const recent = useMemo(() => recentDatasets(datasets, 3), [datasets]);
  const continueDs = recent[0] || datasets[0] || null;
  const loading = health == null && datasets.length === 0;
  const healthJobs = health?.desk?.jobs || {};
  const pendingJobs = useMemo(
    () => jobs.filter((job) => /pending|approval|hold/i.test(String(job.status || job.state || ""))),
    [jobs],
  );
  const runningJobs = useMemo(() => jobs.filter(isRunningJob), [jobs]);
  const pending = healthJobs.pending_approval ?? pendingJobs.length;
  const recentRows = recent.length ? recent : datasets.slice(0, 3);
  const queryReady = datasets.filter(isQueryReady).length;
  const firstPendingJob = pendingJobs[0];

  const attentionItems = useMemo(() => {
    const items = [];
    if (pending > 0) {
      const title = firstPendingJob ? jobTitle(firstPendingJob) : "Procurement approval waiting";
      const jobId = firstPendingJob?.id;
      items.push({
        id: "approval",
        kind: "approval",
        label: "Procurement",
        title,
        metric: `${pending} pending`,
        detail: "A consequential acquisition is waiting for source, cost, and destination review.",
        next: "Review in Discover History",
        tab: "browse",
        warn: true,
        prompt: `Review the pending procurement approval for ${title}${jobId ? ` (job ${jobId})` : ""}. Check research fit, source authority, access terms, expected cost, vault destination, and whether this should be approved now.`,
      });
    }
    return items;
  }, [firstPendingJob, pending]);

  const continueWork = () => {
    if (!continueDs) {
      onGoTab("library");
      return;
    }
    onSelectDataset?.(continueDs);
    onPreviewDataset?.(continueDs);
  };

  const openContinueInLibrary = () => {
    if (continueDs) onSelectDataset?.(continueDs);
    onGoTab("library");
  };

  return (
    <PageShell
      className="rd-v2-home-page rd-rc3-home-page"
      title="Home"
      lead="Institutional research data OS — turn a research question into trusted, reusable evidence."
      footer={null}
    >
      <section className="rd-rc3-product-thesis" aria-label="Research Drive purpose">
        <span>Research Drive</span>
        <h2>Search the lab first, verify source and coverage, acquire what is missing, and preserve every useful result for the next project.</h2>
      </section>

      <section
        className="rd-v2-home-continue-card rd-rc3-home-continue"
        aria-label="Continue working"
        aria-busy={loading}
        data-testid="home-continue"
      >
        <div className="rd-v2-home-continue-copy">
          {loading ? (
            <HomeContinueSkeleton />
          ) : (
            <>
              <span>Continue working</span>
              {continueDs ? (
                <>
                  <h2>{displayName(continueDs)}</h2>
                  <p className="rd-v2-home-continue-purpose">{purposeLine(continueDs)}</p>
                  <p className="rd-v2-home-continue-meta">
                    <span className="rd-v2-pill">{statusPill(continueDs)}</span>
                    <span>{lastActivityLine(continueDs)}</span>
                  </p>
                  <p className="rd-v2-home-continue-id mono">{continueDs.dataset_id}</p>
                </>
              ) : (
                <GuidedState
                  eyebrow="No recent asset"
                  title="Open the vault or find missing data"
                  detail="Research Drive has no recent dataset to resume in this browser yet."
                  checks={["Library holds registered assets", "Discover searches beyond current holdings"]}
                />
              )}
            </>
          )}
        </div>
        <div className="rd-v2-home-continue-actions">
          {!loading ? (
            <>
              <button type="button" className="rd-v2-btn sm primary" onClick={continueWork}>
                Continue
              </button>
              {continueDs ? (
                <button type="button" className="rd-v2-btn sm" onClick={openContinueInLibrary}>
                  Open in Library
                </button>
              ) : (
                <button type="button" className="rd-v2-btn sm" onClick={() => onGoTab("browse")}>
                  Discover data
                </button>
              )}
            </>
          ) : null}
        </div>
      </section>

      {loading ? (
        <div className="rd-v2-home-lanes-loading" aria-label="Loading research entrances">
          <Skeleton lines={2} />
          <Skeleton lines={2} />
          <Skeleton lines={2} />
        </div>
      ) : (
        <ResearchLifecycle
          holdings={datasets.length}
          queryReady={queryReady}
          onGoTab={onGoTab}
          onAskComposer={onAskComposer}
        />
      )}

      {!loading ? (
        <ResearchStateBrief
          continueDs={continueDs}
          runningJobs={runningJobs}
          pending={pending}
          onGoTab={onGoTab}
        />
      ) : null}

      <section className="rd-v2-home-attention" aria-label="Attention queue" aria-busy={loading}>
        <div className="rd-v2-home-attention-head">
          <h2>Needs attention</h2>
          <span>{loading ? "Checking" : attentionItems.length ? `${attentionItems.length} of ${attentionItems.length}` : "Clear"}</span>
        </div>
        <div className="rd-v2-home-attention-body">
          {loading ? (
            <Skeleton className="rd-v2-home-attention-skeleton" lines={2} label="Checking the attention queue" />
          ) : attentionItems.length ? (
            attentionItems.map((item) => (
              <AttentionRow
                key={item.id}
                item={item}
                onOpen={(selected) => onOpenAttention?.(selected)}
                onAsk={onAskAttention}
              />
            ))
          ) : (
            <p className="rd-v2-home-attention-empty">Nothing needs a decision right now.</p>
          )}
        </div>
      </section>

      <section className="rd-v2-home-recent" aria-label="Recent research assets" aria-busy={loading}>
        <SectionTitle title="Recent research assets" actionLabel="See Library →" onAction={() => onGoTab("library")} />
        <div className="rd-v2-home-list-panel">
          {loading ? (
            <div className="rd-v2-home-list-skeletons">
              <Skeleton lines={2} label="Loading recent research assets" />
              <Skeleton lines={2} />
              <Skeleton lines={2} />
            </div>
          ) : (
            <CatalogList
              rows={recentRows.map(datasetListItem)}
              onSelectDataset={onSelectDataset}
              onDoubleClick={onPreviewDataset}
              compact
            />
          )}
        </div>
      </section>
    </PageShell>
  );
}
